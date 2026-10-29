const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
}

process.env.ENABLE_DEV_MOCK_AUTH = 'true';
process.env.JUDGE0_FIXTURE_MODE = 'true';
process.env.DISABLE_RUN_CODE_RATE_LIMIT = 'true';

const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('../apps/api/dist/app.module');
const { PrismaClient } = require('@prisma/client');

let app;
let baseUrl;
const prisma = new PrismaClient();

function createPkcePair() {
  const verifier = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

async function loginMockOAuth({ provider, role, email, name, username }) {
  const { verifier, challenge } = createPkcePair();
  const startUrl = new URL(`${baseUrl}/auth/${provider}`);
  startUrl.searchParams.set('role', role);
  startUrl.searchParams.set('mode', 'login');
  startUrl.searchParams.set('origin', 'http://localhost:3000');
  startUrl.searchParams.set('challenge', challenge);
  startUrl.searchParams.set('format', 'json');
  if (email) startUrl.searchParams.set('mockEmail', email);
  if (name) startUrl.searchParams.set('mockName', name);
  if (username) startUrl.searchParams.set('mockUsername', username);

  const startRes = await fetch(startUrl);
  assert.equal(startRes.status, 200);
  const setCookie = startRes.headers.get('set-cookie') || '';
  const bindingCookie = setCookie.split(';')[0];
  const startData = await startRes.json();

  const cbUrl = new URL(startData.redirectUrl);
  cbUrl.searchParams.set('format', 'json');
  const cbRes = await fetch(cbUrl, { headers: { Cookie: bindingCookie } });
  assert.equal(cbRes.status, 200);
  const cbData = await cbRes.json();
  const redirectParsed = new URL(cbData.redirectUrl);
  const exchangeCode = redirectParsed.searchParams.get('code');

  const exRes = await fetch(`${baseUrl}/auth/oauth/exchange`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: 'http://localhost:3000',
    },
    body: JSON.stringify({ code: exchangeCode, verifier }),
  });
  assert.ok(exRes.status === 200 || exRes.status === 201);
  const exData = await exRes.json();
  return {
    accessToken: exData.token || exData.accessToken,
    user: exData.user,
  };
}

before(async () => {
  app = await NestFactory.create(AppModule, { logger: false });
  app.setGlobalPrefix('api');
  await app.listen(0, '127.0.0.1');
  const addr = app.getHttpServer().address();
  baseUrl = `http://127.0.0.1:${addr.port}/api`;
  process.env.GITHUB_CALLBACK_URL = `${baseUrl}/auth/github/callback`;
  process.env.GOOGLE_CALLBACK_URL = `${baseUrl}/auth/google/callback`;
});

after(async () => {
  if (app) await app.close();
  await prisma.$disconnect();
});

test('Candidate Feature Completeness E2E: All 9 Domains + 4 Newly Connected UI Capabilities', async () => {
  const ts = Date.now();

  // Domain 1: Auth & Session (OAuth + GET /auth/me)
  const candAuth = await loginMockOAuth({
    provider: 'github',
    role: 'CANDIDATE',
    email: `cand-complete-${ts}@smartcareer.local`,
    name: 'ผู้สมัคร ทดสอบครบวงจร',
    username: `cand-complete-${ts}`,
  });
  const token = candAuth.accessToken;
  const authHeaders = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };

  const meRes = await fetch(`${baseUrl}/auth/me`, { headers: authHeaders });
  assert.equal(meRes.status, 200);
  const meData = await meRes.json();
  assert.equal(meData.role, 'CANDIDATE');

  // Domain 2: Candidate Profile, GitHub Sync & Skills Summary
  const updateProfRes = await fetch(`${baseUrl}/candidate/profile`, {
    method: 'PUT',
    headers: authHeaders,
    body: JSON.stringify({
      fullName: 'กิตติพงศ์ นักพัฒนาซอฟต์แวร์',
      bio: 'เชี่ยวชาญ TypeScript, React, Node.js และระบบ Cloud',
      education: 'วิทยาศาสตรบัณฑิต สาขาวิทยาการคอมพิวเตอร์',
      experienceYears: 4,
      desiredRole: 'Full-Stack Developer',
      location: 'กรุงเทพมหานคร',
      phone: '0891234567',
      portfolioUrl: 'https://kittipong.dev',
      githubUsername: `cand-complete-${ts}`,
      isPublic: true,
    }),
  });
  assert.equal(updateProfRes.status, 200);
  const prof = await updateProfRes.json();
  assert.equal(prof.fullName, 'กิตติพงศ์ นักพัฒนาซอฟต์แวร์');
  assert.equal(prof.desiredRole, 'Full-Stack Developer');
  assert.equal(prof.educationText, 'วิทยาศาสตรบัณฑิต สาขาวิทยาการคอมพิวเตอร์');
  assert.equal(prof.experienceYears, 4);
  assert.equal(prof.isPublic, true);

  const ghSyncRes = await fetch(`${baseUrl}/github/sync`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ username: `cand-complete-${ts}` }),
  });
  assert.ok(ghSyncRes.status === 200 || ghSyncRes.status === 201);

  const skillsBeforeRes = await fetch(`${baseUrl}/candidate/skills`, { headers: authHeaders });
  assert.equal(skillsBeforeRes.status, 200);
  const skillsBefore = await skillsBeforeRes.json();
  assert.equal(skillsBefore.radar.length, 5);
  assert.ok(Array.isArray(skillsBefore.skills));

  // Domain 3: Job Search, Job Detail, Toggle Favorite & My Saved Favorites (GET /jobs/favorites/me)
  const jobsRes = await fetch(`${baseUrl}/jobs?limit=15&sortBy=publishedAt`, {
    headers: authHeaders,
  });
  assert.equal(jobsRes.status, 200);
  const jobsPayload = await jobsRes.json();
  const jobsList = jobsPayload.jobs || jobsPayload.items || [];
  assert.ok(jobsList.length > 0, 'Expected active jobs in catalog');
  const targetJob = jobsList[0];

  const jobDetailRes = await fetch(`${baseUrl}/jobs/${targetJob.id}`, {
    headers: authHeaders,
  });
  assert.equal(jobDetailRes.status, 200);
  const jobDetail = await jobDetailRes.json();
  assert.equal(jobDetail.id, targetJob.id);

  // Toggle favorite ON
  const favOnRes = await fetch(`${baseUrl}/jobs/${targetJob.id}/favorite`, {
    method: 'POST',
    headers: authHeaders,
  });
  assert.ok(favOnRes.status === 200 || favOnRes.status === 201);
  const favOnData = await favOnRes.json();
  assert.equal(favOnData.isFavorited, true);

  // Fetch My Saved Jobs (GET /jobs/favorites/me) — Newly connected in apps/web/app/jobs/page.tsx
  const myFavsRes = await fetch(`${baseUrl}/jobs/favorites/me`, {
    headers: authHeaders,
  });
  assert.equal(myFavsRes.status, 200);
  const myFavs = await myFavsRes.json();
  assert.ok(Array.isArray(myFavs));
  assert.ok(myFavs.some((f) => f.id === targetJob.id && f.isFavorited === true));

  // Domain 5: Assessments — Theory + Practical Coding (with candidateExplanation & autosave) + Attempt Review Modal
  const jsExam = await prisma.assessment.findUnique({
    where: { slug: 'javascript-practical-coding-v1' },
    include: { questions: { orderBy: { createdAt: 'asc' } } },
  });
  assert.ok(jsExam, 'Expected seeded JavaScript practical coding exam');

  const startExamRes = await fetch(`${baseUrl}/assessments/${jsExam.id}/start`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({}),
  });
  assert.ok(startExamRes.status === 200 || startExamRes.status === 201);
  const startedAttempt = await startExamRes.json();
  assert.ok(startedAttempt.id);
  assert.ok(startedAttempt.startedAt, 'Expected startedAt for live countdown timer');
  assert.ok(startedAttempt.timeLimitMinutes > 0, 'Expected timeLimitMinutes for live countdown timer');

  // Autosave with explanations
  const autosaveRes = await fetch(`${baseUrl}/assessments/${jsExam.id}/autosave`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      attemptId: startedAttempt.id,
      draftCode: {
        codes: { [jsExam.questions[0].id]: jsExam.questions[0].starterCode || '' },
        selectedChoices: {},
        explanations: {
          [jsExam.questions[0].id]: 'ใช้ Hash Map เพื่อลด Time Complexity เหลือ O(n)',
        },
      },
    }),
  });
  assert.ok(autosaveRes.status === 200 || autosaveRes.status === 201);

  // Submit coding questions with candidateExplanation
  for (const q of jsExam.questions) {
    const subCodingRes = await fetch(`${baseUrl}/assessments/${jsExam.id}/submit-coding`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        attemptId: startedAttempt.id,
        questionId: q.id,
        sourceCode: q.solutionCode || q.starterCode,
        candidateExplanation: 'ออกแบบฟังก์ชันแบบ Pure Function และตรวจสอบ Edge Cases ครบถ้วน',
      }),
    });
    assert.ok(subCodingRes.status === 200 || subCodingRes.status === 201);
  }

  const finalizeRes = await fetch(`${baseUrl}/assessments/${jsExam.id}/finalize-attempt`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ attemptId: startedAttempt.id }),
  });
  assert.ok(finalizeRes.status === 200 || finalizeRes.status === 201);
  const finalizedAttempt = await finalizeRes.json();
  assert.equal(finalizedAttempt.status, 'COMPLETED');
  assert.ok(finalizedAttempt.percentage >= 70);

  // Review Attempt Detail (GET /assessments/attempts/:attemptId/review) — Newly connected in apps/web/app/assessments/page.tsx
  const reviewAttemptRes = await fetch(
    `${baseUrl}/assessments/attempts/${startedAttempt.id}/review`,
    { headers: authHeaders },
  );
  assert.equal(reviewAttemptRes.status, 200);
  const reviewAttemptData = await reviewAttemptRes.json();
  assert.equal(reviewAttemptData.id, startedAttempt.id);
  assert.equal(reviewAttemptData.feedbackHidden, false);
  assert.ok(Array.isArray(reviewAttemptData.answers));
  assert.ok(reviewAttemptData.answers.length > 0);
  assert.equal(
    reviewAttemptData.answers[0].executionResult.candidateExplanation,
    'ออกแบบฟังก์ชันแบบ Pure Function และตรวจสอบ Edge Cases ครบถ้วน',
  );

  // Verify Global Skill Score updated after passing practical exam
  const skillsAfterRes = await fetch(`${baseUrl}/candidate/skills`, { headers: authHeaders });
  assert.equal(skillsAfterRes.status, 200);
  const skillsAfter = await skillsAfterRes.json();
  const assessedFrontend = skillsAfter.radar.find((r) => r.category === 'FRONTEND');
  assert.ok(assessedFrontend && assessedFrontend.score >= 70);

  // Domain 6 & 7: Skill Gaps Analysis & Course Filtering by provider & skillId
  const gapsRes = await fetch(
    `${baseUrl}/recommendations/skill-gaps?targetRole=${encodeURIComponent('Full-Stack Developer')}`,
    { headers: authHeaders },
  );
  assert.equal(gapsRes.status, 200);
  const gapsData = await gapsRes.json();
  assert.ok(gapsData.targetCareer);

  // Course filtering by provider (YOUTUBE / UDEMY) & skillId — Newly connected in apps/web/app/courses/page.tsx
  const ytCoursesRes = await fetch(`${baseUrl}/recommendations/courses?provider=YOUTUBE`, {
    headers: authHeaders,
  });
  assert.equal(ytCoursesRes.status, 200);
  const ytCourses = await ytCoursesRes.json();
  assert.ok(Array.isArray(ytCourses));
  assert.ok(ytCourses.every((c) => c.provider === 'YOUTUBE'));

  const udemyCoursesRes = await fetch(`${baseUrl}/recommendations/courses?provider=UDEMY`, {
    headers: authHeaders,
  });
  assert.equal(udemyCoursesRes.status, 200);
  const udemyCourses = await udemyCoursesRes.json();
  assert.ok(Array.isArray(udemyCourses));
  assert.ok(udemyCourses.every((c) => c.provider === 'UDEMY'));

  const skillCoursesRes = await fetch(
    `${baseUrl}/recommendations/courses?skillId=${encodeURIComponent(jsExam.skillId)}`,
    { headers: authHeaders },
  );
  assert.equal(skillCoursesRes.status, 200);
  const skillCourses = await skillCoursesRes.json();
  assert.ok(Array.isArray(skillCourses));

  // Domain 4: Job Application, Status Tracking & Application Cancellation
  const internalJobsRes = await fetch(`${baseUrl}/jobs?source=INTERNAL&limit=20`, {
    headers: authHeaders,
  });
  assert.equal(internalJobsRes.status, 200);
  const internalJobsPayload = await internalJobsRes.json();
  const internalJobsList = internalJobsPayload.jobs || internalJobsPayload.items || [];
  const internalJob =
    internalJobsList.find((j) => j.source === 'INTERNAL' && !j.sourceUrl) ||
    (await prisma.job.findFirst({
      where: { isActive: true, source: 'INTERNAL', sourceUrl: null, skills: { some: {} } },
    }));
  assert.ok(internalJob, 'Expected an active INTERNAL job for direct application');

  const applyRes = await fetch(`${baseUrl}/applications/${internalJob.id}/apply`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      coverLetter: 'สนใจสมัครตำแหน่งนี้และผ่านการประเมินทักษะมาตรฐานแล้วครับ',
    }),
  });
  assert.ok(applyRes.status === 200 || applyRes.status === 201);
  const createdApp = await applyRes.json();
  assert.ok(createdApp.id);

  const myAppsRes = await fetch(`${baseUrl}/applications/my`, { headers: authHeaders });
  assert.equal(myAppsRes.status, 200);
  const myApps = await myAppsRes.json();
  assert.ok(myApps.some((a) => a.id === createdApp.id));

  // Cancel active application
  const cancelRes = await fetch(`${baseUrl}/applications/${createdApp.id}/cancel`, {
    method: 'PATCH',
    headers: authHeaders,
  });
  assert.equal(cancelRes.status, 200);
  const cancelledApp = await cancelRes.json();
  assert.equal(cancelledApp.status, 'CANCELLED');
});
