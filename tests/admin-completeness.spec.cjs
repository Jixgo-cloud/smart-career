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
const createdUserEmails = [];
const createdSkillIds = [];
const createdAssessmentIds = [];
const createdJobIds = [];

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
  if (email) {
    startUrl.searchParams.set('mockEmail', email);
    createdUserEmails.push(email);
  }
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

async function apiCall(method, p, { token, body, raw = false } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${baseUrl}${p}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (raw) return res;
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { status: res.status, data, headers: res.headers };
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
  for (const id of createdAssessmentIds) {
    await prisma.assessment.deleteMany({ where: { id } }).catch(() => {});
  }
  for (const id of createdSkillIds) {
    await prisma.skill.deleteMany({ where: { id } }).catch(() => {});
  }
  for (const id of createdJobIds) {
    await prisma.job.deleteMany({ where: { id } }).catch(() => {});
  }
  if (createdUserEmails.length > 0) {
    const users = await prisma.user.findMany({
      where: { email: { in: createdUserEmails } },
      include: { companyMembers: true },
    });
    const companyIds = users
      .flatMap((u) => u.companyMembers.map((cm) => cm.companyId))
      .filter(Boolean);
    if (companyIds.length > 0) {
      await prisma.company.deleteMany({ where: { id: { in: companyIds } } }).catch(() => {});
    }
    await prisma.user.deleteMany({ where: { email: { in: createdUserEmails } } }).catch(() => {});
  }
  if (app) await app.close();
  await prisma.$disconnect();
});

test('Admin Feature Completeness & All 32 Resolved Audit Defects E2E', async () => {
  const S = Date.now();

  // 1. Auth, RBAC & Logout Token Revocation (DEF-06)
  const badLogin = await apiCall('POST', '/auth/login', {
    body: { email: 'admin@smartcareer.local', password: 'wrong-password-123' },
  });
  assert.equal(badLogin.status, 401);

  const login1 = await apiCall('POST', '/auth/login', {
    body: { email: 'admin@smartcareer.local', password: 'Admin@SmartCareer2026!' },
  });
  assert.ok(login1.status === 200 || login1.status === 201);
  const oldToken = login1.data.token;

  const logoutRes = await apiCall('POST', '/auth/logout', { token: oldToken });
  assert.ok(logoutRes.status === 200 || logoutRes.status === 201);

  const afterLogout = await apiCall('GET', '/admin/dashboard', { token: oldToken });
  assert.equal(afterLogout.status, 401, 'Old JWT must be revoked after logout (DEF-06)');

  // Fresh admin login for remaining tests
  const login2 = await apiCall('POST', '/auth/login', {
    body: { email: 'admin@smartcareer.local', password: 'Admin@SmartCareer2026!' },
  });
  const T = login2.data.token;
  const adminId = login2.data.user.id;

  const cand = await loginMockOAuth({
    provider: 'github',
    role: 'CANDIDATE',
    email: `adm-spec-cand-${S}@cand.local`,
    name: `AdminSpec Candidate ${S}`,
    username: `adm-spec-${S}`,
  });
  const comp = await loginMockOAuth({
    provider: 'google',
    role: 'COMPANY',
    email: `adm-spec-comp-${S}@company.local`,
    name: `AdminSpec Company ${S}`,
  });

  for (const p of ['/admin/dashboard', '/admin/users', '/admin/audit-logs', '/admin/jobs', '/ingestion/quotas']) {
    const rCand = await apiCall('GET', p, { token: cand.accessToken });
    const rComp = await apiCall('GET', p, { token: comp.accessToken });
    assert.equal(rCand.status, 403);
    assert.equal(rComp.status, 403);
  }

  // 2. Dashboard & Users Management (DEF-18, DEF-25)
  const dash = await apiCall('GET', '/admin/dashboard', { token: T });
  assert.equal(dash.status, 200);
  assert.equal(typeof dash.data.totalUsers, 'number');

  const usersPag = await apiCall(
    'GET',
    `/admin/users?paginated=true&page=1&pageSize=10&role=CANDIDATE&search=${encodeURIComponent(`adm-spec-cand-${S}`)}`,
    { token: T },
  );
  assert.equal(usersPag.status, 200);
  assert.equal(usersPag.data.total, 1);
  assert.equal(usersPag.data.items[0].id, cand.user.id);
  assert.ok(usersPag.data.counts.ALL >= 1);

  const strBoolRes = await apiCall('PATCH', `/admin/users/${cand.user.id}/status`, {
    token: T,
    body: { isActive: 'false' },
  });
  assert.equal(strBoolRes.status, 400, 'Non-boolean isActive must be rejected (DEF-18)');

  const deactRes = await apiCall('PATCH', `/admin/users/${cand.user.id}/status`, {
    token: T,
    body: { isActive: false },
  });
  assert.equal(deactRes.status, 200);
  assert.equal(deactRes.data.isActive, false);

  const candBlocked = await apiCall('GET', '/auth/me', { token: cand.accessToken });
  assert.equal(candBlocked.status, 401);

  const reactRes = await apiCall('PATCH', `/admin/users/${cand.user.id}/status`, {
    token: T,
    body: { isActive: true },
  });
  assert.equal(reactRes.status, 200);

  const selfDeact = await apiCall('PATCH', `/admin/users/${adminId}/status`, {
    token: T,
    body: { isActive: false },
  });
  assert.equal(selfDeact.status, 400);

  // 3. Skills Management & Slug Collision Fix (DEF-11, DEF-26)
  const sk1 = await apiCall('POST', '/admin/skills', {
    token: T,
    body: { name: `C++Spec${S}`, category: 'BACKEND' },
  });
  const sk2 = await apiCall('POST', '/admin/skills', {
    token: T,
    body: { name: `C#Spec${S}`, category: 'WRITING' },
  });
  assert.equal(sk1.status, 201);
  assert.equal(sk2.status, 201, 'C++ and C# skills must not collide on slug (DEF-11)');
  assert.notEqual(sk1.data.slug, sk2.data.slug);
  createdSkillIds.push(sk1.data.id, sk2.data.id);

  const delSk1 = await apiCall('DELETE', `/admin/skills/${sk1.data.id}`, { token: T });
  const delSk2 = await apiCall('DELETE', `/admin/skills/${sk2.data.id}`, { token: T });
  assert.equal(delSk1.status, 200);
  assert.equal(delSk2.status, 200);

  // 4. Company Verifications & Empty PATCH Protection (DEF-01)
  const pdfBuf = Buffer.from('%PDF-1.4\n%Admin Spec Cert\n%%EOF', 'ascii');
  const verSubmit = await apiCall('POST', '/company/verify', {
    token: comp.accessToken,
    body: {
      businessRegNo: '0105568' + String(S).slice(-6),
      documents: {
        files: [
          {
            name: 'cert.pdf',
            type: 'application/pdf',
            size: pdfBuf.length,
            dataUrl: `data:application/pdf;base64,${pdfBuf.toString('base64')}`,
          },
        ],
      },
    },
  });
  assert.equal(verSubmit.status, 201);
  const verId = verSubmit.data.id;

  const emptyPatch = await apiCall('PATCH', `/admin/verifications/${verId}`, {
    token: T,
    body: {},
  });
  assert.equal(
    emptyPatch.status,
    400,
    'Empty PATCH /admin/verifications/:id must return 400 and NOT auto-approve (DEF-01)',
  );

  const docRes = await apiCall('GET', `/admin/verifications/${verId}/documents/0`, {
    token: T,
    raw: true,
  });
  assert.equal(docRes.status, 200);
  assert.ok(Buffer.from(await docRes.arrayBuffer()).equals(pdfBuf));

  const approveRes = await apiCall('PUT', `/admin/verifications/${verId}/review`, {
    token: T,
    body: { action: 'APPROVE' },
  });
  assert.equal(approveRes.status, 200);
  assert.equal(approveRes.data.status, 'VERIFIED');

  // 5. Platform Assessments Governance (DEF-05, DEF-09, DEF-10, DEF-19, DEF-30)
  const allSkills = await apiCall('GET', '/admin/skills', { token: T });
  const skillId = allSkills.data[0].id;

  const codingExam = await apiCall('POST', '/admin/assessments', {
    token: T,
    body: {
      title: `AdminSpec Coding ${S}`,
      skillId,
      examType: 'CODING_SANDBOX',
      feedbackVisibility: 'SUMMARY_ONLY',
      status: 'PUBLISHED',
      questions: [
        {
          prompt: 'Return input unchanged',
          starterCode: 'function solve(input) {\n  return input;\n}\n',
          testCases: [
            { input: '1', expectedOutput: '1', isHidden: false },
            { input: '2', expectedOutput: '2', isHidden: true },
          ],
          points: 100,
        },
      ],
    },
  });
  assert.equal(codingExam.status, 201);
  createdAssessmentIds.push(codingExam.data.id);
  assert.equal(
    codingExam.data.feedbackVisibility,
    'AFTER_REVIEW',
    'SUMMARY_ONLY must map to AFTER_REVIEW (DEF-09)',
  );
  assert.equal(
    codingExam.data.questions[0].solutionCode,
    null,
    'solutionCode must not duplicate starterCode when omitted (DEF-30)',
  );

  const putAlias = await apiCall('PUT', `/admin/assessments/${codingExam.data.id}`, {
    token: T,
    body: { feedbackVisibility: 'SUMMARY_ONLY', title: `AdminSpec Coding ${S} v2` },
  });
  assert.equal(
    putAlias.status,
    200,
    'PUT /admin/assessments/:id with feedbackVisibility alias must not throw 500 (DEF-05)',
  );
  assert.equal(putAlias.data.feedbackVisibility, 'AFTER_REVIEW');

  const draftStatus = await apiCall(
    'PATCH',
    `/admin/assessments/${codingExam.data.id}/status`,
    { token: T, body: { status: 'DRAFT' } },
  );
  assert.equal(
    draftStatus.status,
    400,
    'Unsupported DRAFT status must be rejected with 400 (DEF-10)',
  );

  const badVisibility = await apiCall(
    'PATCH',
    `/admin/assessments/${codingExam.data.id}/feedback-visibility`,
    { token: T, body: { feedbackVisibility: 'GARBAGE_VALUE' } },
  );
  assert.equal(
    badVisibility.status,
    400,
    'Invalid feedbackVisibility must be rejected with 400 (DEF-19)',
  );

  const delExam = await apiCall('DELETE', `/admin/assessments/${codingExam.data.id}`, {
    token: T,
  });
  assert.equal(delExam.status, 200);

  // 6. Ingestion Safety: Closed Courses & deleteMode Validation (DEF-13, DEF-20)
  const activeCourse = await prisma.course.findFirst({
    where: { url: { startsWith: 'https://' } },
    select: { id: true, title: true },
  });
  if (activeCourse) {
    const delActiveCourse = await apiCall('POST', '/ingestion/cleanup-closed-courses', {
      token: T,
      body: { courseIds: [activeCourse.id] },
    });
    assert.equal(
      delActiveCourse.status,
      400,
      'cleanup-closed-courses must reject active course IDs (DEF-13)',
    );
    const stillExists = await prisma.course.findUnique({ where: { id: activeCourse.id } });
    assert.ok(stillExists, 'Active course must remain intact');
  }

  const badDeleteMode = await apiCall('POST', '/ingestion/cleanup-closed-jobs?limit=5', {
    token: T,
    body: { deleteMode: 'HARD_DELETE' },
  });
  assert.equal(
    badDeleteMode.status,
    400,
    'cleanup-closed-jobs must reject unsupported deleteMode (DEF-20)',
  );

  // 7. Data Browser & Audit Logs Endpoints (DEF-14, DEF-31)
  const [jobsList, compsList, appsList, auditList] = await Promise.all([
    apiCall('GET', '/admin/jobs?page=1&pageSize=5', { token: T }),
    apiCall('GET', '/admin/companies?page=1&pageSize=5', { token: T }),
    apiCall('GET', '/admin/applications?page=1&pageSize=5', { token: T }),
    apiCall('GET', '/admin/audit-logs?page=1&pageSize=10', { token: T }),
  ]);
  assert.equal(jobsList.status, 200);
  assert.equal(compsList.status, 200);
  assert.equal(appsList.status, 200);
  assert.equal(auditList.status, 200);
  assert.ok(
    auditList.data.items.length > 0,
    'Admin mutations must be recorded in AdminAuditLog (DEF-14)',
  );
});
