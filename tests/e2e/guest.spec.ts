import { test, expect } from '@playwright/test';
import { expectGuarded, watchHealth } from './helpers';

test.describe('Guest: public pages and route guards', () => {
  for (const path of ['/', '/jobs', '/courses', '/assessments', '/login', '/register']) {
    test(`public page ${path} renders without errors`, async ({ page }) => {
      const problems = watchHealth(page);
      const res = await page.goto(path);
      expect(res?.status()).toBeLessThan(400);
      await page.waitForLoadState('networkidle').catch(() => {});
      await expect(page.locator('body')).not.toContainText(/Application error|Unhandled Runtime Error/);
      expect(problems).toEqual([]);
    });
  }

  test('login page offers all three role entry points', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: /เข้าสู่ระบบ SmartCareer/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /GitHub OAuth/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Google OAuth/ })).toBeVisible();
    await expect(page.getByRole('button', { name: 'เข้าสู่ระบบ Admin' })).toBeVisible();
  });

  test('admin login rejects wrong password with an error message', async ({ page }) => {
    await page.goto('/login');
    await page.locator('input[type="email"]').fill('admin@smartcareer.local');
    await page.locator('input[type="password"]').fill('wrong-password-123');
    await page.getByRole('button', { name: 'เข้าสู่ระบบ Admin' }).click();
    await expect(page.locator('div.bg-red-50')).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  const protectedPaths: Array<[string, RegExp?]> = [
    ['/profile'],
    ['/applications'],
    ['/learning-plan'],
    ['/company/dashboard'],
    ['/company/jobs'],
    ['/company/jobs/new'],
    ['/company/applications'],
    ['/company/assessments'],
    ['/company/profile'],
    ['/admin/dashboard'],
    ['/admin/users'],
    ['/admin/skills'],
    ['/admin/assessments'],
    ['/admin/verifications'],
    ['/admin/ingestion'],
    ['/admin/data'],
    ['/admin/audit-logs'],
  ];
  for (const [path] of protectedPaths) {
    test(`guest is blocked from ${path}`, async ({ page }) => {
      await expectGuarded(page, path);
    });
  }
});
