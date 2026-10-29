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
  const cbRes = await fetch(cbUrl, {
    headers: { Cookie: bindingCookie },
  });
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

test('Full Section 23 UAT Journey: Guest -> Candidate -> Platform Exams -> Company -> Admin -> Evaluation -> Learning Plan -> Ingestion', async () => {
  const uniqueSuffix = Date.now();

  // 1. Health & Public GitHub Context Analysis
  const healthRes = await fetch(`${baseUrl}/health`);
  assert.equal(healthRes.status, 200);
  const health = await healthRes.json();
  assert.equal(health.status, 'ok');

  const pubGhRes = await fetch(`${baseUrl}/github/public/octocat`);
  assert.equal(pubGhRes.status, 200);
  const pubGh = await pubGhRes.json();
  assert.equal(pubGh.contextOnly, true);
  assert.equal(pubGh.proficiencyScore, null);

  // 2. Candidate Login & Initial Radar (All Unassessed -> score === null)
  const candAuth = await loginMockOAuth({
    provider: 'github',
    role: 'CANDIDATE',
    email: `uat-cand-${uniqueSuffix}@smartcareer.local`,
    name: 'UAT Candidate',
    username: `uat-cand-${uniqueSuffix}`,
  });
  const candToken = candAuth.accessToken;

  const radarBeforeRes = await fetch(`${baseUrl}/candidate/radar`, {
    headers: { Authorization: `Bearer ${candToken}` },
  });
  assert.equal(radarBeforeRes.status, 200);
  const radarBefore = await radarBeforeRes.json();
  assert.ok(Array.isArray(radarBefore));
  assert.ok(radarBefore.every((r) => r.score === null));

  // 3. Theory Exam does NOT alter Global Practical Skill Score
  const theoryExam = await prisma.assessment.findUnique({
    where: { slug: 'web-engineering-theory-v1' },
    include: { questions: { include: { choices: true } } },
  });
  assert.ok(theoryExam, 'Expected seeded theory exam');

  const startTheoryRes = await fetch(`${baseUrl}/assessments/${theoryExam.id}/start`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${candToken}`,
    },
    body: JSON.stringify({}),
  });
  assert.ok(startTheoryRes.status === 200 || startTheoryRes.status === 201);
  const theoryAttempt = await startTheoryRes.json();

  const theoryAnswers = theoryExam.questions.map((q) => {
    const correctChoice = q.choices.find((c) => c.isCorrect) || q.choices[0];
    return { questionId: q.id, selectedChoiceId: correctChoice.id };
  });

  const submitTheoryRes = await fetch(
    `${baseUrl}/assessments/${theoryExam.id}/submit-theory`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${candToken}`,
      },
      body: JSON.stringify({
        attemptId: theoryAttempt.id,
        answers: theoryAnswers,
      }),
    },
  );
  assert.ok(submitTheoryRes.status === 200 || submitTheoryRes.status === 201);

  const radarAfterTheory = await (
    await fetch(`${baseUrl}/candidate/radar`, {
      headers: { Authorization: `Bearer ${candToken}` },
    })
  ).json();
  assert.ok(
    radarAfterTheory.every((r) => r.score === null),
    'THEORY exam must not populate practical radar scores',
  );

  // 4. Practical Coding Exam updates Global Skill Score & Awards Badge
  const jsExam = await prisma.assessment.findUnique({
    where: { slug: 'javascript-practical-coding-v1' },
    include: { questions: { orderBy: { createdAt: 'asc' } } },
  });
  assert.ok(jsExam, 'Expected seeded JavaScript practical exam');

  const startJsRes = await fetch(`${baseUrl}/assessments/${jsExam.id}/start`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${candToken}`,
    },
    body: JSON.stringify({}),
  });
  const jsAttempt = await startJsRes.json();

  for (const q of jsExam.questions) {
    const codeToSubmit = q.solutionCode || q.starterCode;
    const runRes = await fetch(`${baseUrl}/assessments/${jsExam.id}/run-code`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${candToken}`,
      },
      body: JSON.stringify({
        attemptId: jsAttempt.id,
        questionId: q.id,
        sourceCode: codeToSubmit,
      }),
    });
    assert.ok(runRes.status === 200 || runRes.status === 201);

    const subRes = await fetch(`${baseUrl}/assessments/${jsExam.id}/submit-coding`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${candToken}`,
      },
      body: JSON.stringify({
        attemptId: jsAttempt.id,
        questionId: q.id,
        sourceCode: codeToSubmit,
      }),
    });
    assert.ok(subRes.status === 200 || subRes.status === 201);
  }

  const finRes = await fetch(`${baseUrl}/assessments/${jsExam.id}/finalize-attempt`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${candToken}`,
    },
    body: JSON.stringify({ attemptId: jsAttempt.id }),
  });
  assert.ok(finRes.status === 200 || finRes.status === 201);
  const finData = await finRes.json();
  assert.ok(finData.percentage >= 70, `Expected passing percentage >= 70, got ${finData.percentage}`);

  const radarAfterJs = await (
    await fetch(`${baseUrl}/candidate/radar`, {
      headers: { Authorization: `Bearer ${candToken}` },
    })
  ).json();
  const frontendRadar = radarAfterJs.find((r) => r.category === 'FRONTEND');
  assert.ok(frontendRadar && frontendRadar.score >= 70);

  const badgesRes = await fetch(`${baseUrl}/assessments/my-badges`, {
    headers: { Authorization: `Bearer ${candToken}` },
  });
  const badges = await badgesRes.json();
  assert.ok(badges.length >= 1, 'Expected verified badge after passing practical coding exam');

  // 5. Company Registration, Verification (PDF Magic Byte validated), and Admin Approval
  const compAuth = await loginMockOAuth({
    provider: 'google',
    role: 'COMPANY',
    email: `uat-hr-${uniqueSuffix}@corp.local`,
    name: `UAT Tech Corp ${uniqueSuffix}`,
  });
  const compToken = compAuth.accessToken;

  const pdfBuffer = Buffer.from('%PDF-1.4\n%SmartCareer UAT Document\n%%EOF', 'ascii');
  const pdfDataUrl = `data:application/pdf;base64,${pdfBuffer.toString('base64')}`;

  const verifyReqRes = await fetch(`${baseUrl}/company/verify`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${compToken}`,
    },
    body: JSON.stringify({
      businessRegNo: '0105569998877',
      documents: {
        files: [
          {
            name: 'company-registration.pdf',
            type: 'application/pdf',
            size: pdfBuffer.length,
            dataUrl: pdfDataUrl,
          },
        ],
      },
    }),
  });
  assert.ok(verifyReqRes.status === 200 || verifyReqRes.status === 201);
  const verificationRecord = await verifyReqRes.json();

  // Admin Login
  const adminLoginRes = await fetch(`${baseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'admin@smartcareer.local',
      password: 'Admin@SmartCareer2026!',
    }),
  });
  assert.ok(adminLoginRes.status === 200 || adminLoginRes.status === 201);
  const adminAuth = await adminLoginRes.json();
  const adminToken = adminAuth.token || adminAuth.accessToken;

  const approveRes = await fetch(
    `${baseUrl}/admin/verifications/${verificationRecord.id}/review`,
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

  // 6. Verified Company creates custom assessment + Job (acceptedQuota: 1)
  const createCompExamRes = await fetch(`${baseUrl}/company/assessments`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${compToken}`,
    },
    body: JSON.stringify({
      title: `UAT Company Coding Challenge ${uniqueSuffix}`,
      description: 'Company custom open-ended architecture challenge.',
      skillId: jsExam.skillId,
      type: 'PRACTICAL_CODING',
      timeLimitMinutes: 45,
      passingScore: 70,
      questions: [
        {
          title: 'Idempotent Payment Handler',
          prompt: 'Design an idempotent payment handler in JavaScript.',
          difficulty: 'MEDIUM',
          points: 100,
          evaluationMethod: 'OPEN_ENDED',
          starterCode: 'function handlePayment(req) { return true; }',
          rubric: 'Must validate request key and handle retries safely.',
        },
      ],
    }),
  });
  assert.ok(createCompExamRes.status === 200 || createCompExamRes.status === 201);
  const compExam = await createCompExamRes.json();

  const createJobRes = await fetch(`${baseUrl}/company/jobs`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${compToken}`,
    },
    body: JSON.stringify({
      title: `UAT Senior JS Engineer ${uniqueSuffix}`,
      description: 'Build high-reliability systems with JavaScript and Node.js.',
      employmentType: 'FULL_TIME',
      location: 'Bangkok',
      salaryMin: 60000,
      salaryMax: 95000,
      acceptedQuota: 1,
      customAssessmentId: compExam.id,
      skills: [
        {
          skillId: jsExam.skillId,
          isRequired: true,
          minimumScore: 65,
        },
      ],
    }),
  });
  assert.ok(createJobRes.status === 200 || createJobRes.status === 201);
  const createdJob = await createJobRes.json();

  // 7. Candidate applies to the job -> Match Snapshot recorded
  const applyRes = await fetch(`${baseUrl}/applications/${createdJob.id}/apply`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${candToken}`,
    },
    body: JSON.stringify({ coverLetter: 'Ready for the challenge!' }),
  });
  assert.ok(applyRes.status === 200 || applyRes.status === 201);
  const application = await applyRes.json();
  assert.ok(application.matchScoreAtApplication >= 70);

  // 8. Candidate takes Company Assessment -> PENDING_HUMAN_REVIEW -> Company Manual Override Score
  const startCompExamRes = await fetch(`${baseUrl}/assessments/${compExam.id}/start`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${candToken}`,
    },
    body: JSON.stringify({}),
  });
  assert.ok(startCompExamRes.status === 200 || startCompExamRes.status === 201);
  const compAttempt = await startCompExamRes.json();

  const subCompCode = await fetch(`${baseUrl}/assessments/${compExam.id}/submit-coding`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${candToken}`,
    },
    body: JSON.stringify({
      attemptId: compAttempt.id,
      questionId: compExam.questions[0].id,
      sourceCode: 'function handlePayment(req) { return { ok: true }; }',
    }),
  });
  assert.ok(subCompCode.status === 200 || subCompCode.status === 201);

  const finCompRes = await fetch(`${baseUrl}/assessments/${compExam.id}/finalize-attempt`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${candToken}`,
    },
    body: JSON.stringify({ attemptId: compAttempt.id }),
  });
  assert.ok(finCompRes.status === 200 || finCompRes.status === 201);
  const finCompData = await finCompRes.json();
  assert.equal(finCompData.reviewStatus, 'PENDING_HUMAN_REVIEW');
  assert.equal(finCompData.percentage, null);

  // Company overrides score manually
  const overrideRes = await fetch(
    `${baseUrl}/assessments/attempts/${compAttempt.id}/override-score`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${compToken}`,
      },
      body: JSON.stringify({
        humanScore: 92,
        reviewReason: 'Clean idempotency design verified by lead architect.',
      }),
    },
  );
  assert.ok(overrideRes.status === 200 || overrideRes.status === 201);
  const overriddenAttempt = await overrideRes.json();
  assert.equal(overriddenAttempt.finalScore, 92);

  // 9. Company submits 4-dimension Evaluation & Accepts Candidate (Quota Auto-Closes Job)
  const evalRes = await fetch(`${baseUrl}/evaluations/${application.id}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${compToken}`,
    },
    body: JSON.stringify({
      technicalScore: 5,
      problemSolvingScore: 4,
      communicationScore: 4,
      teamworkScore: 5,
      overallFeedback: 'Strong practical JavaScript fundamentals and clean code.',
      strengths: ['Clean JavaScript', 'Solid API design'],
      developmentSkillIds: [jsExam.skillId],
      developmentNote: 'Build a multi-region queue consumer project.',
    }),
  });
  assert.ok(evalRes.status === 200 || evalRes.status === 201);
  const evaluation = await evalRes.json();

  const acceptRes = await fetch(`${baseUrl}/company/applications/${application.id}/status`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${compToken}`,
    },
    body: JSON.stringify({ status: 'ACCEPTED', note: 'Welcome aboard!' }),
  });
  assert.equal(acceptRes.status, 200);

  const jobAfterAccept = await prisma.job.findUnique({ where: { id: createdJob.id } });
  assert.equal(jobAfterAccept.isActive, false, 'Job must auto-close when acceptedQuota is reached');

  // 10. Candidate updates Learning Plan progress & verifies 409 Optimistic Concurrency Control
  const devPlanRes = await fetch(`${baseUrl}/recommendations/development-plan`, {
    headers: { Authorization: `Bearer ${candToken}` },
  });
  assert.equal(devPlanRes.status, 200);
  const devPlan = await devPlanRes.json();
  const evalPlan = devPlan.evaluations.find((e) => e.evaluationId === evaluation.id);
  assert.ok(evalPlan);

  const progUpdate1 = await fetch(
    `${baseUrl}/recommendations/development-plan/${evaluation.id}/skills/${jsExam.skillId}/progress`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${candToken}`,
      },
      body: JSON.stringify({
        status: 'IN_PROGRESS',
        note: 'Started building queue consumer',
        evidenceUrl: 'https://github.com/uat/queue-consumer',
        revision: evalPlan.revision,
      }),
    },
  );
  assert.equal(progUpdate1.status, 200);
  const prog1 = await progUpdate1.json();

  // Stale revision must fail with 409 Conflict
  const staleRes = await fetch(
    `${baseUrl}/recommendations/development-plan/${evaluation.id}/skills/${jsExam.skillId}/progress`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${candToken}`,
      },
      body: JSON.stringify({
        status: 'COMPLETED',
        note: 'Stale write attempt with old revision',
        revision: '1999-01-01T00:00:00.000Z',
      }),
    },
  );
  assert.equal(staleRes.status, 409);

  // Valid update with latest revision succeeds
  const progUpdate2 = await fetch(
    `${baseUrl}/recommendations/development-plan/${evaluation.id}/skills/${jsExam.skillId}/progress`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${candToken}`,
      },
      body: JSON.stringify({
        status: 'COMPLETED',
        note: 'Completed queue consumer project',
        evidenceUrl: 'https://github.com/uat/queue-consumer',
        revision: prog1.revision,
        expectedUpdatedAt: prog1.updatedAt,
      }),
    },
  );
  assert.equal(progUpdate2.status, 200);

  // 11. Admin Local Job Batch Ingestion with Idempotency Request Key
  const reqKey = `uat-batch-${uniqueSuffix}`;
  const jobNum = String(uniqueSuffix).slice(-8);
  const batchPayload = {
    requestKey: reqKey,
    batch: {
      version: 1,
      source: 'JOBSDB',
      collectedAt: new Date().toISOString(),
      jobs: [
        {
          id: `jobsdb-${jobNum}`,
          title: 'Cloud Infrastructure Engineer',
          company: 'Global Cloud Ltd',
          logoUrl: null,
          description: 'Manage Docker containers and PostgreSQL clusters in production.',
          location: 'Bangkok',
          url: `https://th.jobsdb.com/job/${jobNum}`,
        },
      ],
    },
  };

  const ingest1 = await fetch(`${baseUrl}/ingestion/local-jobs`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify(batchPayload),
  });
  assert.ok(ingest1.status === 200 || ingest1.status === 201);
  const run1 = await ingest1.json();

  const ingest2 = await fetch(`${baseUrl}/ingestion/local-jobs`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify(batchPayload),
  });
  assert.ok(ingest2.status === 200 || ingest2.status === 201);
  const run2 = await ingest2.json();
  assert.equal(run2.id, run1.id, 'Same requestKey must return the existing IngestionRun');
});
