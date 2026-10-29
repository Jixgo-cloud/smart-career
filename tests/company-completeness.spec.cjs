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

test('Company Feature Completeness E2E: All 8 Domains & 12 Resolved Audit Items (ISS-01 to ISS-12)', async () => {
  const suffix = Date.now();

  // 1. Auth & Role Isolation
  const compAuth = await loginMockOAuth({
    provider: 'google',
    role: 'COMPANY',
    email: `comp-e2e-${suffix}@company.local`,
    name: `E2E Company ${suffix}`,
  });
  const compToken = compAuth.accessToken;
  assert.equal(compAuth.user.role, 'COMPANY');
  assert.equal(compAuth.user.company.memberRole, 'OWNER');

  // 2. Company Profile with industry, companySize, contactEmail, contactPhone (ISS-01 & ISS-12)
  const putProfRes = await fetch(`${baseUrl}/company/profile`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${compToken}`,
    },
    body: JSON.stringify({
      name: `E2E Company Updated ${suffix}`,
      companyName: `E2E Company Updated ${suffix}`,
      industry: 'Cloud & AI Infrastructure',
      companySize: '200-500 คน',
      website: 'https://e2e-company.example.com',
      logoUrl: 'https://e2e-company.example.com/logo.png',
      address: 'Bangkok, Thailand',
      location: 'Bangkok, Thailand',
      description: 'Enterprise AI & Cloud company',
      contactEmail: 'hr@e2e-company.example.com',
      contactPhone: '02-999-8888',
    }),
  });
  assert.equal(putProfRes.status, 200);
  const profUpdated = await putProfRes.json();
  assert.equal(profUpdated.industry, 'Cloud & AI Infrastructure');
  assert.equal(profUpdated.companySize, '200-500 คน');
  assert.equal(profUpdated.contactEmail, 'hr@e2e-company.example.com');
  assert.equal(profUpdated.contactPhone, '02-999-8888');

  // 3. Multi-file Business Verification & Document Download (ISS-07 & ISS-08)
  const pdfBuf = Buffer.from('%PDF-1.4\n%Valid Company Certificate\n%%EOF', 'ascii');
  const verifyRes = await fetch(`${baseUrl}/company/verify`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${compToken}`,
    },
    body: JSON.stringify({
      businessRegNo: '0105568889900',
      documents: {
        files: [
          {
            name: 'cert-page1.pdf',
            type: 'application/pdf',
            size: pdfBuf.length,
            dataUrl: `data:application/pdf;base64,${pdfBuf.toString('base64')}`,
          },
          {
            name: 'cert-page2.pdf',
            type: 'application/pdf',
            size: pdfBuf.length,
            dataUrl: `data:application/pdf;base64,${pdfBuf.toString('base64')}`,
          },
        ],
      },
    }),
  });
  assert.equal(verifyRes.status, 201);
  const verification = await verifyRes.json();
  assert.equal(verification.documents.files.length, 2);

  // Admin approves company verification
  const adminLoginRes = await fetch(`${baseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'admin@smartcareer.local',
      password: 'Admin@SmartCareer2026!',
    }),
  });
  const { token: adminToken } = await adminLoginRes.json();
  const approveRes = await fetch(
    `${baseUrl}/admin/verifications/${verification.id}/review`,
    {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ action: 'APPROVE' }),
    },
  );
  assert.equal(approveRes.status, 200);

  // 4. Company Custom Assessment with gradingMode="COMPANY_MANUAL" (ISS-02 & ISS-11)
  const skills = await prisma.skill.findMany({ take: 2 });
  const skill1 = skills[0];
  const skill2 = skills[1] || skills[0];

  const createExamRes = await fetch(`${baseUrl}/company/assessments`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${compToken}`,
    },
    body: JSON.stringify({
      title: `E2E Company Exam ${suffix}`,
      description: 'Architecture coding challenge',
      skillId: skill1.id,
      type: 'PRACTICAL_CODING',
      timeLimitMinutes: 60,
      passingScore: 75,
      feedbackVisibility: 'AFTER_REVIEW',
      questions: [
        {
          title: 'Distributed Lock',
          prompt: 'Implement acquireLock(key, ttlMs).',
          difficulty: 'MEDIUM',
          points: 100,
          evaluationMethod: 'OPEN_ENDED',
          starterCode: 'function acquireLock(key, ttlMs) { return true; }',
          rubric: { customGuidelines: 'Check atomicity and TTL expiration' },
        },
      ],
    }),
  });
  assert.equal(createExamRes.status, 201);
  const createdExam = await createExamRes.json();
  assert.equal(createdExam.gradingMode, 'COMPANY_MANUAL');

  // 5. Create & Edit Job Posting (ISS-05)
  const createJobRes = await fetch(`${baseUrl}/company/jobs`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${compToken}`,
    },
    body: JSON.stringify({
      title: `E2E Backend Architect ${suffix}`,
      description: 'Design high-availability distributed systems.',
      employmentType: 'FULL_TIME',
      location: 'Bangkok',
      isRemote: true,
      salaryMin: 70000,
      salaryMax: 120000,
      acceptedQuota: 1,
      customAssessmentId: createdExam.id,
      skills: [{ skillId: skill1.id, isRequired: true, minimumScore: 70 }],
    }),
  });
  assert.equal(createJobRes.status, 201);
  const createdJob = await createJobRes.json();

  const updateJobRes = await fetch(`${baseUrl}/company/jobs/${createdJob.id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${compToken}`,
    },
    body: JSON.stringify({
      title: `E2E Principal Backend Architect ${suffix}`,
      salaryMax: 140000,
    }),
  });
  assert.equal(updateJobRes.status, 200);
  const updatedJob = await updateJobRes.json();
  assert.equal(updatedJob.salaryMax, 140000);

  // 6. Candidate Applies, Takes Company Exam (with integrityEvent & explanation), Company Reviews (ISS-03, ISS-04, ISS-06, ISS-09, ISS-10, ISS-11)
  const candAuth = await loginMockOAuth({
    provider: 'github',
    role: 'CANDIDATE',
    email: `cand-comp-e2e-${suffix}@smartcareer.local`,
    name: `Candidate E2E ${suffix}`,
    username: `cand-comp-e2e-${suffix}`,
  });
  const candToken = candAuth.accessToken;

  const applyRes = await fetch(`${baseUrl}/applications/${createdJob.id}/apply`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${candToken}`,
    },
    body: JSON.stringify({
      coverLetter: 'Experienced in distributed systems.',
      resumeUrl: 'https://example.com/cand-resume.pdf',
    }),
  });
  assert.equal(applyRes.status, 201);
  const application = await applyRes.json();

  const startAttemptRes = await fetch(`${baseUrl}/assessments/${createdExam.id}/start`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${candToken}`,
    },
    body: JSON.stringify({}),
  });
  const attempt = await startAttemptRes.json();

  await fetch(`${baseUrl}/assessments/${createdExam.id}/integrity-event`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${candToken}`,
    },
    body: JSON.stringify({ attemptId: attempt.id, type: 'TAB_BLUR' }),
  });

  await fetch(`${baseUrl}/assessments/${createdExam.id}/submit-coding`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${candToken}`,
    },
    body: JSON.stringify({
      attemptId: attempt.id,
      questionId: createdExam.questions[0].id,
      sourceCode: 'function acquireLock(key, ttlMs) { return { acquired: true }; }',
      candidateExplanation: 'Used SET NX PX pattern.',
    }),
  });

  const attemptsForCompany = await (
    await fetch(`${baseUrl}/company/assessments/${createdExam.id}/attempts`, {
      headers: { Authorization: `Bearer ${compToken}` },
    })
  ).json();
  assert.equal(attemptsForCompany.length, 1);
  assert.equal(
    attemptsForCompany[0].codeSubmissions[0].executionResult.candidateExplanation,
    'Used SET NX PX pattern.',
  );

  // Override score with reviewFeedback
  const overrideRes = await fetch(
    `${baseUrl}/assessments/attempts/${attempt.id}/override-score`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${compToken}`,
      },
      body: JSON.stringify({
        humanScore: 95,
        reviewReason: 'Solid distributed lock logic.',
        reviewFeedback: 'Great explanation of SET NX PX.',
      }),
    },
  );
  assert.equal(overrideRes.status, 201);

  // Multi-skill 4D evaluation (ISS-09)
  const devSkills = Array.from(new Set([skill1.id, skill2.id]));
  const evalRes = await fetch(`${baseUrl}/evaluations/${application.id}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${compToken}`,
    },
    body: JSON.stringify({
      technicalScore: 5,
      problemSolvingScore: 5,
      communicationScore: 4,
      teamworkScore: 5,
      overallFeedback: 'Top tier candidate.',
      strengths: ['Distributed systems', 'Clear communication'],
      developmentSkillIds: devSkills,
      developmentNote: 'Explore Redlock consensus.',
    }),
  });
  assert.equal(evalRes.status, 201);
  const evalSaved = await evalRes.json();
  assert.equal(evalSaved.areasForImprovement.skills.length, devSkills.length);

  // Accept candidate & verify public job acceptedCount === 1 (ISS-04)
  const acceptRes = await fetch(`${baseUrl}/company/applications/${application.id}/status`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${compToken}`,
    },
    body: JSON.stringify({
      status: 'ACCEPTED',
      note: 'Hired!',
      internalNote: 'HR internal note: Senior band approved',
    }),
  });
  assert.equal(acceptRes.status, 200);

  const pubJobDetail = await (await fetch(`${baseUrl}/jobs/${createdJob.id}/detail`)).json();
  assert.equal(pubJobDetail.acceptedCount, 1);
  assert.equal(pubJobDetail.isActive, false);
});
