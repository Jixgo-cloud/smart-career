import { test, expect } from '@playwright/test';
import { expectGuarded, expectRoleBlocked, loginCompany, logout, watchHealth } from './helpers';

const JOB_TITLE = `E2E-PW Job ${Date.now()}`;

test.describe('Company journey (browser)', () => {
  test('login via Google demo → dashboard, then every company page loads cleanly', async ({ page }) => {
    test.setTimeout(300_000);
    const problems = watchHealth(page);
    await loginCompany(page);
    for (const path of ['/company/dashboard', '/company/jobs', '/company/jobs/new', '/company/applications', '/company/assessments', '/company/profile']) {
      await page.goto(path);
      await page.waitForLoadState('networkidle').catch(() => {});
      await expect(page.locator('body'), path).not.toContainText(/Application error|Unhandled Runtime Error|ไม่มีสิทธิ์/);
      await expect(page).toHaveURL(new RegExp(path.replace(/\//g, '\\/') + '$'));
    }
    expect(problems).toEqual([]);
  });

  test('company profile shows verification section', async ({ page }) => {
    await loginCompany(page);
    await page.goto('/company/profile');
    await expect(page.getByRole('heading', { name: /ข้อมูลบริษัทและการยืนยันตัวตนนิติบุคคล/ })).toBeVisible();
  });

  test('create a job through the form and see it in the job list, then remove it', async ({ page }) => {
    const problems = watchHealth(page);
    await loginCompany(page);
    await page.goto('/company/jobs/new');
    await expect(page.getByRole('heading', { name: /สร้างประกาศตำแหน่งงานใหม่/ })).toBeVisible();
    await page.locator('input[type="text"]').first().fill(JOB_TITLE);
    await page.locator('textarea').first().fill('E2E Playwright job description for automated verification.');
    await page.getByRole('button', { name: /เผยแพร่ประกาศตำแหน่งงาน/ }).click();
    await page.waitForURL('**/company/jobs', { timeout: 30_000 });
    await expect(page.getByText(JOB_TITLE)).toBeVisible({ timeout: 20_000 });

    // cleanup via UI: the delete control is on the job card (no confirm dialog)
    const card = page
      .getByText(JOB_TITLE)
      .first()
      .locator('xpath=ancestor::div[.//button[contains(., "ลบประกาศ")]][1]');
    await card.getByRole('button', { name: 'ลบประกาศ' }).click();
    await expect(page.getByText(/ลบประกาศตำแหน่งงานเรียบร้อยแล้ว/)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(JOB_TITLE)).toHaveCount(0, { timeout: 15_000 });
    expect(problems).toEqual([]);
  });

  test('job form rejects empty required fields (browser validation keeps user on page)', async ({ page }) => {
    await loginCompany(page);
    await page.goto('/company/jobs/new');
    await page.getByRole('button', { name: /เผยแพร่ประกาศตำแหน่งงาน/ }).click();
    await expect(page).toHaveURL(/\/company\/jobs\/new$/);
  });

  test('company is blocked from admin and candidate-only pages', async ({ page }) => {
    await loginCompany(page);
    await expectRoleBlocked(page, '/admin/dashboard');
    await expectRoleBlocked(page, '/admin/users');
    await expectRoleBlocked(page, '/profile');
    await expectRoleBlocked(page, '/learning-plan');
    await expectRoleBlocked(page, '/applications');
  });

  test('logout ends the session and re-protects company pages', async ({ page }) => {
    await loginCompany(page);
    await logout(page);
    await expectGuarded(page, '/company/dashboard');
  });
});
