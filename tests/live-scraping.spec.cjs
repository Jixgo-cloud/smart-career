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
process.env.INGESTION_SIMULATE_PROVIDER_FAILURE = 'false';

const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('../apps/api/dist/app.module');
const { PrismaClient } = require('@prisma/client');

let app;
let baseUrl;
let adminToken;
const prisma = new PrismaClient();

function createPkcePair() {
  const verifier = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

async function loginAdmin() {
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
  return adminAuth.token || adminAuth.accessToken;
}

before(async () => {
  app = await NestFactory.create(AppModule, { logger: false });
  app.setGlobalPrefix('api');
  await app.listen(0, '127.0.0.1');
  const addr = app.getHttpServer().address();
  baseUrl = `http://127.0.0.1:${addr.port}/api`;
  process.env.GITHUB_CALLBACK_URL = `${baseUrl}/auth/github/callback`;
  process.env.GOOGLE_CALLBACK_URL = `${baseUrl}/auth/google/callback`;
  adminToken = await loginAdmin();
});

after(async () => {
  if (app) await app.close();
  await prisma.$disconnect();
});

test('1. Live Blognone scraping (HTTP/2 GraphQL + detail enrichment) fetches and persists real Blognone jobs', async () => {
  const res = await fetch(`${baseUrl}/ingestion/sync-jobs`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify({
      source: 'BLOGNONE',
      limit: 5,
      requestKey: `live-blognone-${Date.now()}`,
    }),
  });
  assert.ok(res.status === 200 || res.status === 201);
  const run = await res.json();
  assert.equal(run.state, 'COMPLETED');
  assert.ok(
    run.result.status === 'SUCCESS' || run.result.status === 'PARTIAL_SUCCESS',
    `Expected Blognone run SUCCESS, got ${JSON.stringify(run.result)}`,
  );
  const totalProcessed =
    run.result.createdCount + run.result.updatedCount + run.result.duplicateCount;
  assert.ok(totalProcessed >= 5, `Expected at least 5 Blognone jobs processed, got ${totalProcessed}`);

  const dbJobs = await prisma.job.findMany({
    where: { source: 'BLOGNONE', isActive: true },
    include: { skills: { include: { skill: true } } },
    orderBy: { updatedAt: 'desc' },
    take: 5,
  });
  assert.ok(dbJobs.length >= 5);
  for (const j of dbJobs) {
    assert.match(
      j.sourceUrl,
      /^https:\/\/jobs\.blognone\.com\/company\/[^/]+\/job\/[A-Za-z0-9_-]+$/,
    );
    assert.ok(j.description.length >= 100, `Expected full description for Blognone job ${j.title}`);
  }
});

test('2. Live JobsDB Thailand scraping (HTTP/2 SSR + deep detail enrichment) fetches and persists real JobsDB jobs', async () => {
  const res = await fetch(`${baseUrl}/ingestion/sync-jobs`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify({
      source: 'JOBSDB',
      limit: 5,
      requestKey: `live-jobsdb-${Date.now()}`,
    }),
  });
  assert.ok(res.status === 200 || res.status === 201);
  const run = await res.json();
  assert.equal(run.state, 'COMPLETED');
  assert.ok(
    run.result.status === 'SUCCESS' || run.result.status === 'PARTIAL_SUCCESS',
    `Expected JobsDB run SUCCESS, got ${JSON.stringify(run.result)}`,
  );
  const totalProcessed =
    run.result.createdCount + run.result.updatedCount + run.result.duplicateCount;
  assert.ok(totalProcessed >= 5, `Expected at least 5 JobsDB jobs processed, got ${totalProcessed}`);

  const dbJobs = await prisma.job.findMany({
    where: {
      source: 'JOBSDB',
      isActive: true,
      externalId: { not: 'jobsdb-88990011' }, // exclude seeded item to verify newly scraped ones
    },
    include: { skills: { include: { skill: true } } },
    orderBy: { updatedAt: 'desc' },
    take: 5,
  });
  assert.ok(dbJobs.length >= 5);
  for (const j of dbJobs) {
    assert.match(j.sourceUrl, /^https:\/\/th\.jobsdb\.com\/job\/\d+$/);
    assert.ok(j.description.length >= 100, `Expected full description for JobsDB job ${j.title}`);
  }
});

test('3. Live JobThai scraping fetches and persists real JobThai jobs', async () => {
  const res = await fetch(`${baseUrl}/ingestion/sync-jobs`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify({
      source: 'JOBTHAI',
      limit: 3,
      requestKey: `live-jobthai-${Date.now()}`,
    }),
  });
  assert.ok(res.status === 200 || res.status === 201);
  const run = await res.json();
  assert.equal(run.state, 'COMPLETED');
  assert.ok(
    run.result.status === 'SUCCESS' || run.result.status === 'PARTIAL_SUCCESS',
    `Expected JobThai run SUCCESS, got ${JSON.stringify(run.result)}`,
  );
  const totalProcessed =
    run.result.createdCount + run.result.updatedCount + run.result.duplicateCount;
  assert.ok(totalProcessed >= 3);

  const bfRes = await fetch(`${baseUrl}/ingestion/backfill-skills`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert.ok(bfRes.status === 200 || bfRes.status === 201);
});
