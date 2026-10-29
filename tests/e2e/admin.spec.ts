import { test, expect } from '@playwright/test';
import { expectGuarded, loginAdmin, logout, watchHealth } from './helpers';

const ADMIN_PAGES = [
  '/admin/dashboard',
  '/admin/users',
  '/admin/verifications',
  '/admin/skills',
  '/admin/assessments',
  '/admin/ingestion',
  '/admin/data',
  '/admin/audit-logs',
];

test.describe('Admin journey (browser)', () => {
  test('login with email/password → dashboard, then every admin page loads cleanly', async ({ page }) => {
    test.setTimeout(300_000);
    const problems = watchHealth(page);
    await loginAdmin(page);
    for (const path of ADMIN_PAGES) {
      await page.goto(path);
      await page.waitForLoadState('networkidle').catch(() => {});
      await expect(page.locator('body'), path).not.toContainText(/Application error|Unhandled Runtime Error|401 Unauthorized/);
      await expect(page).toHaveURL(new RegExp(path.replace(/\//g, '\\/') + '$'));
    }
    expect(problems).toEqual([]);
  });

  test('users page lists accounts', async ({ page }) => {
    await loginAdmin(page);
    await page.goto('/admin/users');
    await expect(page.getByRole('heading', { name: /จัดการบัญชีผู้ใช้งาน/ })).toBeVisible();
    await expect(page.locator('table tbody tr').first()).toBeVisible({ timeout: 20_000 });
  });

  test('admin sidebar navigation reaches each section', async ({ page }) => {
    await loginAdmin(page);
    for (const href of ADMIN_PAGES) {
      await page.locator(`a[href="${href}"]`).first().click();
      await page.waitForURL(new RegExp(href.replace(/\//g, '\\/') + '$'));
    }
  });

  test('audit logs record admin login', async ({ page }) => {
    await loginAdmin(page);
    await page.goto('/admin/audit-logs');
    await page.waitForLoadState('networkidle').catch(() => {});
    await expect(page.locator('body')).toContainText(/AUTH_LOGIN/);
  });

  test('admin accessing candidate/company-only pages does not break the app', async ({ page }) => {
    const problems = watchHealth(page);
    await loginAdmin(page);
    for (const path of ['/profile', '/company/dashboard']) {
      await page.goto(path);
      await page.waitForLoadState('networkidle').catch(() => {});
      await expect(page.locator('body')).not.toContainText(/Application error|Unhandled Runtime Error/);
    }
    expect(problems).toEqual([]);
  });

  test('logout ends the session and re-protects admin pages', async ({ page }) => {
    await loginAdmin(page);
    await logout(page);
    await expectGuarded(page, '/admin/dashboard');
  });
});
