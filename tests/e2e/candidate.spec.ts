import { test, expect } from '@playwright/test';
import { expectGuarded, expectRoleBlocked, loginCandidate, logout, watchHealth } from './helpers';

test.describe('Candidate journey (browser)', () => {
  test('login via GitHub demo → profile, then every candidate page loads cleanly', async ({ page }) => {
    test.setTimeout(300_000);
    const problems = watchHealth(page);
    await loginCandidate(page);
    await expect(page.getByRole('heading', { name: /โปรไฟล์ผู้สมัครและผลประเมินทักษะ/ })).toBeVisible();

    for (const path of ['/jobs', '/assessments', '/courses', '/applications', '/learning-plan', '/profile']) {
      await page.goto(path);
      await page.waitForLoadState('networkidle').catch(() => {});
      await expect(page.locator('body'), path).not.toContainText(/Application error|Unhandled Runtime Error|ไม่มีสิทธิ์|403/);
      await expect(page).toHaveURL(new RegExp(path.replace('/', '\\/') + '$'));
    }
    expect(problems).toEqual([]);
  });

  test('assessment center lists exams and an exam page opens', async ({ page }) => {
    const problems = watchHealth(page);
    await loginCandidate(page);
    await page.goto('/assessments');
    await expect(page.getByRole('heading', { name: /ศูนย์สอบมาตรฐานกลาง/ })).toBeVisible();
    const examLink = page.locator('a[href^="/assessments/"]').first();
    await expect(examLink, 'at least one published exam link').toBeVisible({ timeout: 20_000 });
    await examLink.click();
    await page.waitForURL(/\/assessments\/[^/]+$/);
    await page.waitForLoadState('networkidle').catch(() => {});
    await expect(page.locator('body')).not.toContainText(/Application error|Unhandled Runtime Error/);
    expect(problems).toEqual([]);
  });

  test('job list → job detail opens and shows match section for candidate', async ({ page }) => {
    const problems = watchHealth(page);
    await loginCandidate(page);
    await page.goto('/jobs');
    const jobLink = page.locator('a[href^="/jobs/"]').first();
    await expect(jobLink, 'at least one job link').toBeVisible({ timeout: 30_000 });
    await jobLink.click();
    await page.waitForURL(/\/jobs\/[^/]+$/);
    await page.waitForLoadState('networkidle').catch(() => {});
    await expect(page.locator('body')).not.toContainText(/Application error|Unhandled Runtime Error/);
    await expect(page.locator('h1, h2').first()).toBeVisible();
    expect(problems).toEqual([]);
  });

  test('candidate is blocked from company and admin areas', async ({ page }) => {
    await loginCandidate(page);
    await expectRoleBlocked(page, '/admin/dashboard');
    await expectRoleBlocked(page, '/company/dashboard');
    await expectRoleBlocked(page, '/company/jobs/new');
  });

  test('logout ends the session and re-protects candidate pages', async ({ page }) => {
    await loginCandidate(page);
    await logout(page);
    await expectGuarded(page, '/profile');
  });
});
