import { defineConfig, devices } from '@playwright/test';

/**
 * Browser E2E for SmartCareer (Candidate / Company / Admin).
 * Expects the dev stack already running: web on :3000, API on :4000 with ENABLE_DEV_MOCK_AUTH=true
 * and NEXT_PUBLIC_SHOW_DEMO_LOGIN=true (demo login buttons). Override with E2E_BASE_URL.
 */
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['html', { outputFolder: 'outputs/playwright-report', open: 'never' }], ['json', { outputFile: 'outputs/playwright-results.json' }]],
  outputDir: 'outputs/playwright-artifacts',
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:3000',
    navigationTimeout: 60_000,
    actionTimeout: 20_000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
