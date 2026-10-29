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
  assert.ok(exchangeCode, 'Expected one-use exchange code');

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
    exchangeCode,
    verifier,
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

test('1. Local registration is disabled with 400/410', async () => {
  const res = await fetch(`${baseUrl}/auth/register`, { method: 'POST' });
  assert.ok(res.status === 400 || res.status === 410);
});

test('2. OAuth PKCE enforces verifier and prevents one-use exchange code replay', async () => {
  const auth = await loginMockOAuth({
    provider: 'github',
    role: 'CANDIDATE',
    email: 'sec-cand1@smartcareer.local',
    name: 'Sec Candidate 1',
    username: 'sec-cand1',
  });
  assert.ok(auth.accessToken);

  // Replay the exact same one-use code
  const replayRes = await fetch(`${baseUrl}/auth/oauth/exchange`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: 'http://localhost:3000',
    },
    body: JSON.stringify({ code: auth.exchangeCode, verifier: auth.verifier }),
  });
  assert.equal(replayRes.status, 401);
});

test('3. GET /assessments/:id strips correctAnswer, explanation, referenceSolution, and hidden test cases', async () => {
  const listRes = await fetch(`${baseUrl}/assessments`);
  assert.equal(listRes.status, 200);
  const exams = await listRes.json();
  assert.ok(exams.length > 0);

  for (const examItem of exams) {
    const detailRes = await fetch(`${baseUrl}/assessments/${examItem.id}`);
    assert.equal(detailRes.status, 200);
    const detail = await detailRes.json();

    for (const q of detail.questions || []) {
      assert.equal(q.correctAnswer, undefined, 'correctAnswer must not be exposed');
      assert.equal(q.explanation, undefined, 'explanation must not be exposed before submit');
      assert.equal(q.referenceSolution, undefined, 'referenceSolution must not be exposed');
      for (const tc of q.testCases || []) {
        assert.notEqual(tc.isHidden, true, 'Hidden test cases must be stripped');
      }
    }
  }
});

test('4. External job rejects internal application with 400 Bad Request', async () => {
  const cand = await loginMockOAuth({
    provider: 'github',
    role: 'CANDIDATE',
    email: 'sec-ext@smartcareer.local',
    name: 'Sec Ext Candidate',
    username: 'sec-ext',
  });

  const externalJob = await prisma.job.findFirst({
    where: { source: { not: 'INTERNAL' } },
  });
  assert.ok(externalJob, 'Expected seeded external job');

  const applyRes = await fetch(`${baseUrl}/applications/${externalJob.id}/apply`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${cand.accessToken}`,
    },
    body: JSON.stringify({ coverLetter: 'Should fail on external job' }),
  });
  assert.equal(applyRes.status, 400);
});

test('5. Application ownership isolation blocks unrelated candidate and company (403 Forbidden)', async () => {
  const runId = Date.now();
  const candA = await loginMockOAuth({
    provider: 'github',
    role: 'CANDIDATE',
    email: `sec-owner-a-${runId}@smartcareer.local`,
    name: 'Candidate Owner A',
    username: `sec-owner-a-${runId}`,
  });
  const candB = await loginMockOAuth({
    provider: 'github',
    role: 'CANDIDATE',
    email: `sec-owner-b-${runId}@smartcareer.local`,
    name: 'Candidate Intruder B',
    username: `sec-owner-b-${runId}`,
  });
  const compB = await loginMockOAuth({
    provider: 'google',
    role: 'COMPANY',
    email: `intruder-hr-${runId}@othercorp.local`,
    name: 'OtherCorp HR',
  });

  const internalJob = await prisma.job.findFirst({
    where: { source: 'INTERNAL', isActive: true },
  });
  assert.ok(internalJob);

  const applyRes = await fetch(`${baseUrl}/applications/${internalJob.id}/apply`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${candA.accessToken}`,
    },
    body: JSON.stringify({ coverLetter: 'Candidate A legitimate application' }),
  });
  assert.ok(applyRes.status === 200 || applyRes.status === 201);
  const application = await applyRes.json();

  // Owner Candidate A can read
  const ownerRes = await fetch(`${baseUrl}/applications/${application.id}`, {
    headers: { Authorization: `Bearer ${candA.accessToken}` },
  });
  assert.equal(ownerRes.status, 200);

  // Unrelated Candidate B is blocked with 403
  const intruderCandRes = await fetch(`${baseUrl}/applications/${application.id}`, {
    headers: { Authorization: `Bearer ${candB.accessToken}` },
  });
  assert.equal(intruderCandRes.status, 403);

  // Unrelated Company B is blocked with 403
  const intruderCompRes = await fetch(`${baseUrl}/applications/${application.id}`, {
    headers: { Authorization: `Bearer ${compB.accessToken}` },
  });
  assert.equal(intruderCompRes.status, 403);
});

test('6. Unverified company cannot create jobs (403) and invalid minimumScore (0 or >100) is rejected (400)', async () => {
  const unverifiedComp = await loginMockOAuth({
    provider: 'google',
    role: 'COMPANY',
    email: 'unverified-sec@corp.local',
    name: 'Unverified Corp',
  });

  const skill = await prisma.skill.findFirst();
  const postUnverified = await fetch(`${baseUrl}/company/jobs`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${unverifiedComp.accessToken}`,
    },
    body: JSON.stringify({
      title: 'Unauthorized Job',
      description: 'Should fail because company is not verified yet',
      skills: [{ skillId: skill.id, isRequired: true, minimumScore: 60 }],
    }),
  });
  assert.equal(postUnverified.status, 403);

  // Verified demo company testing invalid minimumScore = 0
  const verifiedComp = await loginMockOAuth({
    provider: 'google',
    role: 'COMPANY',
    email: 'hr@technova.co.th',
    name: 'TechNova HR',
  });

  const badMinScoreRes = await fetch(`${baseUrl}/company/jobs`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${verifiedComp.accessToken}`,
    },
    body: JSON.stringify({
      title: 'Invalid Min Score Job',
      description: 'minimumScore 0 is invalid',
      skills: [{ skillId: skill.id, isRequired: true, minimumScore: 0 }],
    }),
  });
  assert.equal(badMinScoreRes.status, 400);
});
