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
const createdUserIds = [];

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
  if (exData.user?.id) {
    createdUserIds.push(exData.user.id);
  }
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
  for (const uid of createdUserIds) {
    await prisma.company.deleteMany({
      where: { members: { some: { userId: uid } } },
    }).catch(() => {});
    await prisma.user.delete({ where: { id: uid } }).catch(() => {});
  }
  if (app) await app.close();
  await prisma.$disconnect();
});

test('End-to-End Notification System: All Role Triggers, Internal Note Suppression, Privacy Guards & IDOR Security', async () => {
  const suffix = Date.now();

  // 1. Unauthenticated requests must be rejected with 401
  const unauthList = await fetch(`${baseUrl}/notifications`);
  assert.equal(unauthList.status, 401);
  const unauthCount = await fetch(`${baseUrl}/notifications/unread-count`);
  assert.equal(unauthCount.status, 401);

  // 2. Authenticate Admin, Company, and two Candidates
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

  const compAuth = await loginMockOAuth({
    provider: 'google',
    role: 'COMPANY',
    email: `notif-comp-${suffix}@corp.local`,
    name: `Notif Corp ${suffix}`,
  });
  const compToken = compAuth.accessToken;

  const candAuth = await loginMockOAuth({
    provider: 'github',
    role: 'CANDIDATE',
    email: `notif-cand-${suffix}@smartcareer.local`,
    name: `Notif Candidate ${suffix}`,
    username: `notif-cand-${suffix}`,
  });
  const candToken = candAuth.accessToken;

  const otherCandAuth = await loginMockOAuth({
    provider: 'github',
    role: 'CANDIDATE',
    email: `notif-other-${suffix}@smartcareer.local`,
    name: `Other Candidate ${suffix}`,
    username: `notif-other-${suffix}`,
  });
  const otherCandToken = otherCandAuth.accessToken;

  // 3. Company submits verification -> Admin receives SYSTEM_ANNOUNCEMENT notification
  const pdfBuffer = Buffer.from('%PDF-1.4\n%SmartCareer Notification Test\n%%EOF', 'ascii');
  const pdfDataUrl = `data:application/pdf;base64,${pdfBuffer.toString('base64')}`;

  const verifyReqRes = await fetch(`${baseUrl}/company/verify`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${compToken}`,
    },
    body: JSON.stringify({
      businessRegNo: '0105561234567',
      documents: {
        files: [
          {
            name: 'DBD-Registration.pdf',
            type: 'application/pdf',
            size: pdfBuffer.length,
            dataUrl: pdfDataUrl,
          },
        ],
      },
    }),
  });
  assert.ok(verifyReqRes.status === 200 || verifyReqRes.status === 201);
  const verification = await verifyReqRes.json();

  const adminNotifs = await fetch(`${baseUrl}/notifications?limit=10`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  }).then((r) => r.json());
  const adminVerifNotif = adminNotifs.find(
    (n) => n.metadata?.verificationId === verification.id,
  );
  assert.ok(adminVerifNotif, 'Expected ADMIN to receive notification on company verification submission');
  assert.equal(adminVerifNotif.type, 'SYSTEM_ANNOUNCEMENT');
  assert.equal(adminVerifNotif.link, '/admin/verifications');

  // Cleanup the admin notification we just created so we keep admin inbox clean
  await prisma.notification.delete({ where: { id: adminVerifNotif.id } }).catch(() => {});

  // 4. Admin approves verification -> Company receives SYSTEM_ANNOUNCEMENT notification
  const approveRes = await fetch(`${baseUrl}/admin/verifications/${verification.id}/review`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify({ action: 'APPROVE' }),
  });
  assert.equal(approveRes.status, 200);

  let compNotifs = await fetch(`${baseUrl}/notifications?limit=15`, {
    headers: { Authorization: `Bearer ${compToken}` },
  }).then((r) => r.json());
  const compApprovedNotif = compNotifs.find(
    (n) => n.type === 'SYSTEM_ANNOUNCEMENT' && n.metadata?.verificationId === verification.id,
  );
  assert.ok(compApprovedNotif, 'Expected COMPANY to receive notification after verification approval');
  assert.equal(compApprovedNotif.link, '/company/profile');

  // 5. Company creates two custom assessments (one AFTER_REVIEW, one PRIVATE_TO_COMPANY) and two jobs
  const skill = await prisma.skill.findFirst();
  assert.ok(skill, 'Expected at least one seeded skill');

  const createExamAfterReviewRes = await fetch(`${baseUrl}/company/assessments`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${compToken}`,
    },
    body: JSON.stringify({
      title: `Notif Exam AfterReview ${suffix}`,
      description: 'Exam with AFTER_REVIEW visibility',
      skillId: skill.id,
      type: 'PRACTICAL_CODING',
      timeLimitMinutes: 30,
      passingScore: 70,
      feedbackVisibility: 'AFTER_REVIEW',
      questions: [
        {
          title: 'Q1',
          prompt: 'Write a handler function.',
          difficulty: 'MEDIUM',
          points: 100,
          evaluationMethod: 'OPEN_ENDED',
          starterCode: 'function solve() { return 1; }',
          rubric: 'Clean implementation.',
        },
      ],
    }),
  });
  assert.ok(createExamAfterReviewRes.status === 200 || createExamAfterReviewRes.status === 201);
  const examAfterReview = await createExamAfterReviewRes.json();

  const createExamPrivateRes = await fetch(`${baseUrl}/company/assessments`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${compToken}`,
    },
    body: JSON.stringify({
      title: `Notif Exam Private ${suffix}`,
      description: 'Exam with PRIVATE_TO_COMPANY visibility',
      skillId: skill.id,
      type: 'PRACTICAL_CODING',
      timeLimitMinutes: 30,
      passingScore: 70,
      feedbackVisibility: 'PRIVATE_TO_COMPANY',
      questions: [
        {
          title: 'Private Q1',
          prompt: 'Write a secret handler.',
          difficulty: 'MEDIUM',
          points: 100,
          evaluationMethod: 'OPEN_ENDED',
          starterCode: 'function secret() { return 1; }',
          rubric: 'Internal grading only.',
        },
      ],
    }),
  });
  assert.ok(createExamPrivateRes.status === 200 || createExamPrivateRes.status === 201);
  const examPrivate = await createExamPrivateRes.json();

  const createJob1Res = await fetch(`${baseUrl}/company/jobs`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${compToken}`,
    },
    body: JSON.stringify({
      title: `Notif Engineer Job 1 ${suffix}`,
      description: 'Backend system engineering role with Node.js and TypeScript.',
      employmentType: 'FULL_TIME',
      location: 'Bangkok',
      customAssessmentId: examPrivate.id,
      skills: [{ skillId: skill.id, isRequired: true, minimumScore: 60 }],
    }),
  });
  assert.ok(createJob1Res.status === 200 || createJob1Res.status === 201);
  const job1 = await createJob1Res.json();

  const createJob2Res = await fetch(`${baseUrl}/company/jobs`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${compToken}`,
    },
    body: JSON.stringify({
      title: `Notif Engineer Job 2 ${suffix}`,
      description: 'Platform engineering role with distributed systems.',
      employmentType: 'FULL_TIME',
      location: 'Bangkok',
      skills: [{ skillId: skill.id, isRequired: true, minimumScore: 60 }],
    }),
  });
  assert.ok(createJob2Res.status === 200 || createJob2Res.status === 201);
  const job2 = await createJob2Res.json();

  // 6. Candidate applies to Job 1 & Job 2 -> Company receives APPLICATION_STATUS_CHANGED notifications
  const apply1Res = await fetch(`${baseUrl}/applications/${job1.id}/apply`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${candToken}`,
    },
    body: JSON.stringify({ coverLetter: 'Applying to Job 1' }),
  });
  assert.ok(apply1Res.status === 200 || apply1Res.status === 201);
  const app1 = await apply1Res.json();

  const apply2Res = await fetch(`${baseUrl}/applications/${job2.id}/apply`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${candToken}`,
    },
    body: JSON.stringify({ coverLetter: 'Applying to Job 2' }),
  });
  assert.ok(apply2Res.status === 200 || apply2Res.status === 201);
  const app2 = await apply2Res.json();

  compNotifs = await fetch(`${baseUrl}/notifications?limit=15`, {
    headers: { Authorization: `Bearer ${compToken}` },
  }).then((r) => r.json());
  const apply1Notif = compNotifs.find((n) => n.metadata?.applicationId === app1.id);
  assert.ok(apply1Notif, 'Expected COMPANY to receive notification when candidate applies');
  assert.equal(apply1Notif.link, `/company/applications?jobId=${job1.id}`);

  // 7. Company saves internalNote ONLY (status unchanged) -> Candidate must NOT receive a notification
  const candCountBeforeInternalNote = await fetch(`${baseUrl}/notifications/unread-count`, {
    headers: { Authorization: `Bearer ${candToken}` },
  }).then((r) => r.json());
  assert.equal(candCountBeforeInternalNote.unreadCount, 0);

  const internalNoteRes = await fetch(`${baseUrl}/company/applications/${app1.id}/status`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${compToken}`,
    },
    body: JSON.stringify({
      status: app1.status,
      internalNote: 'Private HR note: strong GitHub portfolio',
    }),
  });
  assert.equal(internalNoteRes.status, 200);

  const candCountAfterInternalNote = await fetch(`${baseUrl}/notifications/unread-count`, {
    headers: { Authorization: `Bearer ${candToken}` },
  }).then((r) => r.json());
  assert.equal(
    candCountAfterInternalNote.unreadCount,
    0,
    'Saving only internalNote without changing status or assessment must NOT notify candidate',
  );

  // 8. Company assigns assessment (TECHNICAL_TEST), then updates to INTERVIEW and OFFER -> Candidate gets typed notifications
  const assignRes = await fetch(`${baseUrl}/company/applications/${app1.id}/assign-assessment`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${compToken}`,
    },
    body: JSON.stringify({
      assessmentId: examAfterReview.id,
      note: 'Please complete the technical assessment',
    }),
  });
  assert.ok(assignRes.status === 200 || assignRes.status === 201);

  const interviewRes = await fetch(`${baseUrl}/company/applications/${app1.id}/status`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${compToken}`,
    },
    body: JSON.stringify({ status: 'INTERVIEW', note: 'Invited to technical interview' }),
  });
  assert.equal(interviewRes.status, 200);

  const offerRes = await fetch(`${baseUrl}/company/applications/${app1.id}/status`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${compToken}`,
    },
    body: JSON.stringify({ status: 'OFFER', note: 'Formal offer extended' }),
  });
  assert.equal(offerRes.status, 200);

  let candNotifs = await fetch(`${baseUrl}/notifications?limit=15`, {
    headers: { Authorization: `Bearer ${candToken}` },
  }).then((r) => r.json());
  assert.equal(candNotifs.length, 3);
  assert.ok(candNotifs.some((n) => n.type === 'ASSESSMENT_ASSIGNED'));
  assert.ok(candNotifs.some((n) => n.type === 'INTERVIEW_INVITATION'));
  assert.ok(candNotifs.some((n) => n.type === 'OFFER_RECEIVED'));

  // 9. Candidate completes Company Assessment -> Company receives notification that exam is ready for review
  const startExam1Res = await fetch(`${baseUrl}/assessments/${examAfterReview.id}/start`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${candToken}`,
    },
    body: JSON.stringify({}),
  });
  assert.ok(startExam1Res.status === 200 || startExam1Res.status === 201);
  const attemptAfterReview = await startExam1Res.json();

  await fetch(`${baseUrl}/assessments/${examAfterReview.id}/submit-coding`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${candToken}`,
    },
    body: JSON.stringify({
      attemptId: attemptAfterReview.id,
      questionId: examAfterReview.questions[0].id,
      sourceCode: 'function solve() { return 42; }',
    }),
  });

  compNotifs = await fetch(`${baseUrl}/notifications?limit=15`, {
    headers: { Authorization: `Bearer ${compToken}` },
  }).then((r) => r.json());
  const submittedExamNotif = compNotifs.find(
    (n) => n.metadata?.attemptId === attemptAfterReview.id && n.link === '/company/assessments',
  );
  assert.ok(
    submittedExamNotif,
    'Expected COMPANY to receive notification when candidate completes company assessment',
  );

  // 10. Company grades AFTER_REVIEW exam -> Candidate DOES receive notification
  const overrideAfterReviewRes = await fetch(
    `${baseUrl}/assessments/attempts/${attemptAfterReview.id}/override-score`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${compToken}`,
      },
      body: JSON.stringify({
        humanScore: 88,
        reviewReason: 'Solid solution',
      }),
    },
  );
  assert.ok(overrideAfterReviewRes.status === 200 || overrideAfterReviewRes.status === 201);

  candNotifs = await fetch(`${baseUrl}/notifications?limit=15`, {
    headers: { Authorization: `Bearer ${candToken}` },
  }).then((r) => r.json());
  assert.ok(
    candNotifs.some((n) => n.metadata?.attemptId === attemptAfterReview.id),
    'Candidate must receive notification when AFTER_REVIEW exam is graded',
  );

  // 11. Candidate completes PRIVATE_TO_COMPANY exam & Company grades it -> Candidate must NOT receive notification
  const startExamPrivRes = await fetch(`${baseUrl}/assessments/${examPrivate.id}/start`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${candToken}`,
    },
    body: JSON.stringify({}),
  });
  assert.ok(startExamPrivRes.status === 200 || startExamPrivRes.status === 201);
  const attemptPrivate = await startExamPrivRes.json();

  await fetch(`${baseUrl}/assessments/${examPrivate.id}/submit-coding`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${candToken}`,
    },
    body: JSON.stringify({
      attemptId: attemptPrivate.id,
      questionId: examPrivate.questions[0].id,
      sourceCode: 'function secret() { return 99; }',
    }),
  });

  const overridePrivRes = await fetch(
    `${baseUrl}/assessments/attempts/${attemptPrivate.id}/override-score`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${compToken}`,
      },
      body: JSON.stringify({
        humanScore: 95,
        reviewReason: 'Confidential internal score',
      }),
    },
  );
  assert.ok(overridePrivRes.status === 200 || overridePrivRes.status === 201);

  candNotifs = await fetch(`${baseUrl}/notifications?limit=15`, {
    headers: { Authorization: `Bearer ${candToken}` },
  }).then((r) => r.json());
  assert.equal(
    candNotifs.some((n) => n.metadata?.attemptId === attemptPrivate.id),
    false,
    'Candidate must NOT receive notification when PRIVATE_TO_COMPANY exam is graded',
  );

  // 12. Company submits evaluation -> Candidate receives notification, and identical retry does not duplicate
  const evalPayload = {
    technicalScore: 4,
    problemSolvingScore: 5,
    communicationScore: 4,
    teamworkScore: 5,
    overallFeedback: 'Great architectural thinking.',
    strengths: ['System design'],
    developmentSkillIds: [skill.id],
    developmentNote: 'Practice more concurrency patterns.',
  };

  const evalRes1 = await fetch(`${baseUrl}/evaluations/${app1.id}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${compToken}`,
    },
    body: JSON.stringify(evalPayload),
  });
  assert.ok(evalRes1.status === 200 || evalRes1.status === 201);

  // Identical retry
  const evalRes2 = await fetch(`${baseUrl}/evaluations/${app1.id}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${compToken}`,
    },
    body: JSON.stringify(evalPayload),
  });
  assert.ok(evalRes2.status === 200 || evalRes2.status === 201);

  candNotifs = await fetch(`${baseUrl}/notifications?limit=20`, {
    headers: { Authorization: `Bearer ${candToken}` },
  }).then((r) => r.json());
  const evalNotifs = candNotifs.filter((n) => n.link === '/learning-plan');
  assert.equal(evalNotifs.length, 1, 'Identical evaluation retry must not create duplicate notification');

  // 13. Candidate cancels Application 2 -> Company receives cancellation notification
  const cancelRes = await fetch(`${baseUrl}/applications/${app2.id}/cancel`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${candToken}` },
  });
  assert.equal(cancelRes.status, 200);

  compNotifs = await fetch(`${baseUrl}/notifications?limit=20`, {
    headers: { Authorization: `Bearer ${compToken}` },
  }).then((r) => r.json());
  const cancelNotif = compNotifs.find(
    (n) => n.metadata?.applicationId === app2.id && n.metadata?.status === 'CANCELLED',
  );
  assert.ok(cancelNotif, 'Expected COMPANY to receive notification when candidate cancels application');
  assert.equal(cancelNotif.link, `/company/applications?jobId=${job2.id}`);

  // 14. Read state management & IDOR protection
  const targetNotifId = candNotifs[0].id;

  // Cross-user IDOR attempt by otherCandToken must return 404
  const idorMarkRes = await fetch(`${baseUrl}/notifications/${targetNotifId}/read`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${otherCandToken}` },
  });
  assert.equal(idorMarkRes.status, 404, 'Cross-user markRead must be blocked with 404');

  // Owner marks single notification read
  const beforeMarkCount = await fetch(`${baseUrl}/notifications/unread-count`, {
    headers: { Authorization: `Bearer ${candToken}` },
  }).then((r) => r.json());
  assert.equal(beforeMarkCount.unreadCount, 5);

  const markSingleRes = await fetch(`${baseUrl}/notifications/${targetNotifId}/read`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${candToken}` },
  });
  assert.equal(markSingleRes.status, 200);

  const afterSingleCount = await fetch(`${baseUrl}/notifications/unread-count`, {
    headers: { Authorization: `Bearer ${candToken}` },
  }).then((r) => r.json());
  assert.equal(afterSingleCount.unreadCount, 4);

  // Owner marks all notifications read
  const markAllRes = await fetch(`${baseUrl}/notifications/read-all`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${candToken}` },
  });
  assert.equal(markAllRes.status, 200);

  const afterAllCount = await fetch(`${baseUrl}/notifications/unread-count`, {
    headers: { Authorization: `Bearer ${candToken}` },
  }).then((r) => r.json());
  assert.equal(afterAllCount.unreadCount, 0);
});
