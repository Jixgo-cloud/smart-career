import { expect, Page } from '@playwright/test';

export const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL || 'admin@smartcareer.local';
export const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD || 'Admin@SmartCareer2026!';

/** Collects uncaught page errors and API 5xx responses so each test can assert a clean run. */
export function watchHealth(page: Page) {
  const problems: string[] = [];
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('response', (r) => {
    if (r.url().includes('/api/') && r.status() >= 500) problems.push(`HTTP ${r.status()} ${r.request().method()} ${r.url()}`);
  });
  return problems;
}

export async function loginCandidate(page: Page) {
  await page.goto('/login');
  await page.getByRole('button', { name: /Demo Candidate/ }).click();
  await page.waitForURL('**/profile', { timeout: 30_000 });
}

export async function loginCompany(page: Page) {
  await page.goto('/login');
  await page.getByRole('button', { name: /Demo Company/ }).click();
  await page.waitForURL('**/company/dashboard', { timeout: 30_000 });
}

export async function loginAdmin(page: Page) {
  await page.goto('/login');
  await page.locator('input[type="email"]').fill(ADMIN_EMAIL);
  await page.locator('input[type="password"]').fill(ADMIN_PASSWORD);
  await page.getByRole('button', { name: 'เข้าสู่ระบบ Admin' }).click();
  await page.waitForURL('**/admin/dashboard', { timeout: 30_000 });
}

export async function logout(page: Page) {
  await page.locator('button[title="ออกจากระบบ"], button[title="Sign out"]').first().click();
  await expect.poll(async () => (await page.request.get('http://localhost:4000/api/auth/me')).status(), { timeout: 15_000 }).toBe(401);
}

/** A page counts as "guarded" if the visitor ends on /login or sees an auth/permission message instead of role content. */
export async function expectGuarded(page: Page, path: string, forbiddenSelectorText?: RegExp) {
  await page.goto(path);
  await page.waitForLoadState('networkidle').catch(() => {});
  await expect
    .poll(
      async () => {
        const url = new URL(page.url());
        if (url.pathname === '/login') return 'guarded';
        const body = (await page.locator('body').innerText()).slice(0, 4000);
        if (/401|403|Unauthorized|Forbidden|กรุณาเข้าสู่ระบบ|ไม่มีสิทธิ์|เข้าสู่ระบบ/.test(body)) return 'guarded';
        return 'OPEN: ' + body.slice(0, 200).replace(/\s+/g, ' ');
      },
      { timeout: 15_000, message: `${path} should be guarded` },
    )
    .toBe('guarded');
  if (forbiddenSelectorText) await expect(page.locator('body')).not.toContainText(forbiddenSelectorText);
}

/**
 * Stricter check for a logged-in user of the WRONG role: must be redirected away, or the page itself must be replaced
 * by a full-page permission screen (like /admin/* shows). Rendering the role's UI shell with a raw API error banner is a failure.
 */
export async function expectRoleBlocked(page: Page, path: string) {
  await page.goto(path);
  await page.waitForLoadState('networkidle').catch(() => {});
  await expect
    .poll(
      async () => {
        if (new URL(page.url()).pathname !== path) return 'blocked';
        const body = await page.locator('body').innerText();
        if (/403 Forbidden|401 Unauthorized|������Է�����Ҷ֧˹��/.test(body)) return 'blocked';
        const inputs = await page.locator('main form, main input, main textarea').count();
        return `OPEN (role UI rendered, inputs=${inputs})`;
      },
      { timeout: 20_000, message: `wrong-role user should be blocked from ${path}` },
    )
    .toBe('blocked');
}

export const API_URL = process.env.E2E_API_URL || 'http://localhost:4000/api';

/** Sign in as a brand-new (or existing) mock-OAuth identity through the real browser PKCE flow. Needs ENABLE_DEV_MOCK_AUTH=true. */
export async function loginMock(
  page: Page,
  opts: { provider: 'github' | 'google'; role: 'CANDIDATE' | 'COMPANY'; email: string; name: string; username?: string },
) {
  await page.goto('/login');
  await page
    .evaluate(
      async ({ api, o }) => {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
        const arr = new Uint8Array(64);
        window.crypto.getRandomValues(arr);
        const verifier = Array.from(arr, (b) => chars[b % chars.length]).join('');
        window.sessionStorage.setItem('smartcareer_pkce_verifier', verifier);
        const digest = await window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
        let bin = '';
        new Uint8Array(digest).forEach((b) => (bin += String.fromCharCode(b)));
        const challenge = btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
        const url = new URL(api + '/auth/' + o.provider);
        url.searchParams.set('role', o.role);
        url.searchParams.set('mode', 'login');
        url.searchParams.set('origin', window.location.origin);
        url.searchParams.set('challenge', challenge);
        url.searchParams.set('mockEmail', o.email);
        url.searchParams.set('mockName', o.name);
        if (o.username) url.searchParams.set('mockUsername', o.username);
        window.location.href = url.toString();
      },
      { api: API_URL, o: opts },
    )
    .catch(() => {});
  await page.waitForURL(opts.role === 'COMPANY' ? '**/company/dashboard' : '**/profile', { timeout: 60_000 });
}
