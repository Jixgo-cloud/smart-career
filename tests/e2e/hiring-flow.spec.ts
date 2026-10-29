import { test, expect, Browser, BrowserContext, Page } from '@playwright/test';
import { loginAdmin, loginMock, watchHealth } from './helpers';

/**
 * Full hiring journey through the real UI, across all three roles with fresh identities:
 *  Company: submit verification docs  →  Admin: approve  →  Company: publish job
 *  Candidate: apply  →  Company: assign assessment  →  Candidate: take & finalize exam
 *  Company: 4-dimension evaluation  →  Candidate: sees feedback in Learning Plan.
 * Only data setup that has no simple UI (company custom assessment) is created through the API with the company's own session.
 */
const stamp = Date.now();
const companyName = `PW Company ${stamp}`;
const companyEmail = `pw-company-${stamp}@e2e.test`;
const candidateName = `PW Candidate ${stamp}`;
const candidateEmail = `pw-candidate-${stamp}@e2e.test`;
const jobTitle = `E2E-PW Flow Job ${stamp}`;
const examTitle = `E2E-PW Company Exam ${stamp}`;
const feedbackText = `E2E feedback ${stamp}: strong fundamentals`;
const regNo = String(Math.floor(1e12 + (stamp % 9e12))).padStart(13, '1').slice(0, 13);

let adminCtx: BrowserContext, companyCtx: BrowserContext, candidateCtx: BrowserContext;
let admin: Page, company: Page, candidate: Page;
let jobId = '';

async function newPage(browser: Browser) {
  const ctx = await browser.newContext({ baseURL: process.env.E2E_BASE_URL || 'http://localhost:3000' });
  const page = await ctx.newPage();
  page.on('dialog', (d) => d.accept());
  return { ctx, page };
}

test.describe.serial('Full hiring flow (Candidate ↔ Company ↔ Admin)', () => {
  test.setTimeout(240_000);

  test.beforeAll(async ({ browser }) => {
    ({ ctx: adminCtx, page: admin } = await newPage(browser));
    ({ ctx: companyCtx, page: company } = await newPage(browser));
    ({ ctx: candidateCtx, page: candidate } = await newPage(browser));
  });

  test.afterAll(async () => {
    await Promise.all([adminCtx?.close(), companyCtx?.close(), candidateCtx?.close()]);
  });

  test('1. Company registers and uploads verification documents → PENDING', async () => {
    const problems = watchHealth(company);
    await loginMock(company, { provider: 'google', role: 'COMPANY', email: companyEmail, name: companyName });
    await company.goto('/company/profile');
    await expect(company.getByText(/สถานะปัจจุบัน:/)).toBeVisible();
    await company.locator('input.font-mono').fill(regNo);
    await company.locator('input[type="file"]').setInputFiles({
      name: 'company-cert.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4\n%E2E company certificate\n%%EOF'),
    });
    await expect(company.getByText(/เลือกแล้ว 1 ไฟล์/)).toBeVisible();
    await company.getByRole('button', { name: 'ส่งเอกสารยืนยันนิติบุคคล' }).click();
    await expect(company.getByText(/สถานะปัจจุบัน: PENDING/)).toBeVisible({ timeout: 20_000 });
    expect(problems).toEqual([]);
  });

  test('2. Unverified company cannot publish a job (API guard surfaces in UI)', async () => {
    await company.goto('/company/jobs/new');
    await company.locator('input[type="text"]').first().fill(`E2E-PW Blocked ${stamp}`);
    await company.locator('textarea').first().fill('should be rejected while unverified');
    await company.getByRole('button', { name: /เผยแพร่ประกาศตำแหน่งงาน/ }).click();
    await expect(company.locator('div.bg-red-50')).toBeVisible({ timeout: 20_000 });
    await expect(company).toHaveURL(/\/company\/jobs\/new$/);
  });

  test('3. Admin finds the pending company and approves it', async () => {
    await loginAdmin(admin);
    await admin.goto('/admin/verifications');
    const card = admin
      .getByText(companyName, { exact: false })
      .first()
      .locator('xpath=ancestor::div[.//button[contains(., "อนุมัติ")]][1]');
    await expect(card).toBeVisible({ timeout: 30_000 });
    await card.getByRole('button', { name: /อนุมัติ \(VERIFIED\)/ }).click();
    await expect(admin.getByText(/เป็น VERIFIED เรียบร้อยแล้ว/)).toBeVisible({ timeout: 20_000 });
  });

  test('4. Company sees VERIFIED, creates an exam (API) and publishes a job linked to it (UI)', async () => {
    await company.goto('/company/profile');
    await expect(company.getByText(/สถานะปัจจุบัน: VERIFIED/)).toBeVisible({ timeout: 20_000 });

    const skills = await (await company.request.get('/api/skills')).json();
    expect(skills.length).toBeGreaterThan(0);
    const created = await company.request.post('/api/company/assessments', {
      data: {
        title: examTitle,
        description: 'Company custom open-ended challenge (E2E).',
        skillId: skills[0].id,
        type: 'PRACTICAL_CODING',
        timeLimitMinutes: 45,
        passingScore: 70,
        questions: [
          {
            title: 'Idempotent Handler',
            prompt: 'Write an idempotent handler in JavaScript.',
            difficulty: 'MEDIUM',
            points: 100,
            evaluationMethod: 'OPEN_ENDED',
            starterCode: 'function handle(req) { return true; }',
            rubric: 'Must be idempotent.',
          },
        ],
      },
    });
    expect(created.ok(), await created.text()).toBeTruthy();

    await company.goto('/company/jobs/new');
    await company.locator('input[type="text"]').first().fill(jobTitle);
    await company.locator('textarea').first().fill('E2E full-flow job. Build reliable systems.');
    await company.locator('input[type="number"]').nth(2).fill('1'); // accepted quota
    await company
      .locator('select')
      .filter({ has: company.locator('option', { hasText: 'ไม่ผูกข้อสอบ' }) })
      .selectOption({ label: examTitle });
    await company.getByRole('button', { name: /เผยแพร่ประกาศตำแหน่งงาน/ }).click();
    await company.waitForURL('**/company/jobs', { timeout: 30_000 });
    await expect(company.getByText(jobTitle)).toBeVisible({ timeout: 20_000 });

    const jobs = await (await company.request.get('/api/company/jobs')).json();
    const list = Array.isArray(jobs) ? jobs : jobs.items || jobs.data || [];
    jobId = list.find((j: any) => j.title === jobTitle)?.id;
    expect(jobId, 'created job id').toBeTruthy();
  });

  test('5. Candidate opens the job and applies', async () => {
    const problems = watchHealth(candidate);
    await loginMock(candidate, {
      provider: 'github',
      role: 'CANDIDATE',
      email: candidateEmail,
      name: candidateName,
      username: `pw-cand-${stamp}`,
    });
    await candidate.goto(`/jobs/${jobId}`);
    await expect(candidate.getByText(jobTitle).first()).toBeVisible({ timeout: 30_000 });
    await candidate.locator('form textarea').first().fill('E2E cover letter — ready for the challenge.');
    await candidate.getByRole('button', { name: 'ยืนยันการส่งใบสมัครงาน' }).click();
    await expect(candidate.getByText(/ส่งใบสมัครงานเรียบร้อยแล้ว/)).toBeVisible({ timeout: 20_000 });
    await candidate.goto('/applications');
    await expect(candidate.getByText(jobTitle).first()).toBeVisible({ timeout: 20_000 });
    expect(problems).toEqual([]);
  });

  test('6. Company sees the applicant and assigns the exam', async () => {
    await company.goto('/company/applications');
    const card = company
      .getByText(candidateName, { exact: false })
      .first()
      .locator('xpath=ancestor::div[.//button[contains(., "ประเมินผล 4 มิติ")]][1]');
    await expect(card).toBeVisible({ timeout: 30_000 });
    await expect(card.getByText(/E2E cover letter/)).toBeVisible();
    await card
      .locator('select')
      .filter({ has: company.locator('option', { hasText: 'มอบหมายข้อสอบบริษัท' }) })
      .selectOption({ label: examTitle });
    await expect(company.getByText(/มอบหมายข้อสอบให้ผู้สมัครเรียบร้อยแล้ว/)).toBeVisible({ timeout: 20_000 });
  });

  test('7. Candidate takes the assigned exam and finalizes it', async () => {
    const problems = watchHealth(candidate);
    await candidate.goto('/applications');
    const link = candidate.getByRole('link', { name: /ทำข้อสอบเฉพาะตำแหน่ง/ }).first();
    await expect(link).toBeVisible({ timeout: 30_000 });
    await link.click();
    await candidate.waitForURL(/\/assessments\/[^/]+\?applicationId=/);
    const editor = candidate.locator('textarea.font-mono').first();
    await expect(editor).toBeVisible({ timeout: 30_000 });
    await editor.fill('function handle(req) { const seen = new Set(); return seen.has(req.id) ? null : req; }');
    await candidate.getByRole('button', { name: 'บันทึกและส่งคำตอบข้อนี้' }).click();
    // Single-question exams may complete on submit; otherwise the explicit Finalize button is used.
    const done = candidate.getByText(/ส่งข้อสอบเรียบร้อยแล้ว/).first();
    const finalize = candidate.getByRole('button', { name: /ยืนยันส่งข้อสอบปฏิบัติ/ });
    await expect(done.or(finalize)).toBeVisible({ timeout: 30_000 });
    if (await finalize.isVisible().catch(() => false)) await finalize.click();
    await expect(done).toBeVisible({ timeout: 60_000 });
    expect(problems).toEqual([]);
  });

  test('8. Company submits the 4-dimension evaluation', async () => {
    await company.goto('/company/applications');
    const card = company
      .getByText(candidateName, { exact: false })
      .first()
      .locator('xpath=ancestor::div[.//button[contains(., "ประเมินผล 4 มิติ")]][1]');
    await expect(card).toBeVisible({ timeout: 30_000 });
    await card.getByRole('button', { name: 'ประเมินผล 4 มิติ' }).click();
    await company.getByPlaceholder(/สรุปผลการสัมภาษณ์/).fill(feedbackText);
    await company.locator('form button[type="button"]', { hasText: /^\+ / }).first().click();
    await company.getByRole('button', { name: 'บันทึกและส่งผลประเมินให้ผู้สมัคร' }).click();
    await expect(company.getByText(/บันทึกผลประเมิน 4 มิติ/)).toBeVisible({ timeout: 20_000 });
  });

  test('9. Candidate sees the company feedback in the Learning Plan', async () => {
    await candidate.goto('/learning-plan');
    await expect(candidate.getByText(feedbackText)).toBeVisible({ timeout: 30_000 });
  });
});
