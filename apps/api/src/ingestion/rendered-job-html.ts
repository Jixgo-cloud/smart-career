import * as fs from 'fs';
import puppeteer, { Browser, LaunchOptions } from 'puppeteer-core';
import { openJobVirtualDisplay } from './job-virtual-display';

const sourceHosts = new Set(['th.jobsdb.com', 'jobs.blognone.com']);
const assetHosts = new Set([
  ...sourceHosts,
  'jobs-static-prod.blognone.com',
  'jobs-api.blognone.com',
  'cdn.seeklearning.com.au',
]);
let queue: Promise<void> = Promise.resolve();

function resolveBrowserExecutablePath(): string | undefined {
  if (process.env.PUPPETEER_EXECUTABLE_PATH) {
    return process.env.PUPPETEER_EXECUTABLE_PATH;
  }
  const candidates =
    process.platform === 'win32'
      ? [
          'C:/Program Files/Google/Chrome/Application/chrome.exe',
          'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
          'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
          'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
        ]
      : [
          '/usr/bin/google-chrome',
          '/usr/bin/chromium',
          '/usr/bin/chromium-browser',
        ];
  return candidates.find((c) => fs.existsSync(c));
}

export function allowedJobPage(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === 'https:' &&
      !parsed.username &&
      !parsed.password &&
      (!parsed.port || parsed.port === '443') &&
      sourceHosts.has(parsed.hostname)
    );
  } catch {
    return false;
  }
}

export function allowedJobAsset(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === 'https:' &&
      !parsed.username &&
      !parsed.password &&
      (!parsed.port || parsed.port === '443') &&
      assetHosts.has(parsed.hostname)
    );
  } catch {
    return false;
  }
}

// One fresh browser at a time; no account cookies, provider credentials or persistent profile.
export async function fetchRenderedJobHtml(
  url: string,
  launch: (options: LaunchOptions) => Promise<Browser> = (options) =>
    puppeteer.launch(options),
  openDisplay = openJobVirtualDisplay,
): Promise<string> {
  if (!allowedJobPage(url)) {
    throw new Error('SOURCE_BROWSER_URL_DENIED: ที่อยู่แหล่งงานไม่รองรับ');
  }
  const previous = queue;
  let release!: () => void;
  queue = new Promise<void>((resolve) => {
    release = resolve;
  });
  await previous;
  let browser: Browser | undefined;
  let display: Awaited<ReturnType<typeof openJobVirtualDisplay>> | undefined;
  try {
    const args = ['--disable-dev-shm-usage'];
    if (process.platform === 'linux' && process.getuid?.() === 0) {
      args.push('--no-sandbox');
    }
    const browserEnv: Record<string, string> = {};
    for (const name of [
      'PATH',
      'HOME',
      'TMPDIR',
      'TEMP',
      'TMP',
      'LANG',
      'LC_ALL',
      'SYSTEMROOT',
      'WINDIR',
    ]) {
      if (process.env[name]) browserEnv[name] = process.env[name]!;
    }
    if (
      new URL(url).hostname === 'jobs.blognone.com' &&
      process.env.JOB_SCRAPER_BROWSER_MODE === 'headful' &&
      process.platform === 'linux'
    ) {
      display = await openDisplay(browserEnv);
      browserEnv.DISPLAY = display.display;
    }
    browser = await launch({
      headless: !display,
      args,
      env: browserEnv,
      timeout: 30000,
      executablePath: resolveBrowserExecutablePath(),
    });
    const page = await browser.newPage();
    page.setDefaultTimeout(15000);
    await page.setRequestInterception(true);
    page.on('request', (request) => {
      const permitted = request.isNavigationRequest()
        ? allowedJobPage(request.url())
        : allowedJobAsset(request.url()) &&
          !['image', 'media', 'font'].includes(request.resourceType());
      void (permitted ? request.continue() : request.abort()).catch(
        () => undefined,
      );
    });
    const response = await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });
    if (!allowedJobPage(page.url())) {
      throw new Error(
        'SOURCE_BROWSER_URL_DENIED: ต้นทางเปลี่ยนไปยังที่อยู่ที่ไม่รองรับ',
      );
    }
    if (!response || (response.status() >= 400 && response.status() !== 403)) {
      throw new Error(
        `SOURCE_HTTP_${response?.status() || 'UNAVAILABLE'}: ต้นทางยังไม่พร้อมให้เบราว์เซอร์อ่านข้อมูล`,
      );
    }
    const selector =
      new URL(url).hostname === 'th.jobsdb.com'
        ? '[data-testid="job-card"] a[data-automation="jobTitle"]'
        : 'a[href*="/job/"] h3';
    try {
      await page.waitForSelector(selector);
    } catch {
      if (response.status() === 403) {
        throw new Error('SOURCE_HTTP_403: ต้นทางยังไม่อนุญาตให้อ่านประกาศงาน');
      }
      throw new Error(
        'SOURCE_BROWSER_NO_JOBS: หน้าเว็บยังไม่แสดงประกาศงาน หรือมีขั้นตอนตรวจสอบก่อนเข้า',
      );
    }
    if (!allowedJobPage(page.url())) {
      throw new Error(
        'SOURCE_BROWSER_URL_DENIED: ต้นทางเปลี่ยนไปยังที่อยู่ที่ไม่รองรับ',
      );
    }
    const html = await page.content();
    if (Buffer.byteLength(html) > 25 * 1024 * 1024) {
      throw new Error(
        'SOURCE_BROWSER_PAGE_TOO_LARGE: หน้าแหล่งงานใหญ่เกินขอบเขต',
      );
    }
    return html;
  } catch (error: any) {
    if (typeof error?.message === 'string' && error.message.startsWith('SOURCE_')) {
      throw error;
    }
    throw new Error(
      error?.name === 'TimeoutError'
        ? 'SOURCE_BROWSER_TIMEOUT: เบราว์เซอร์อ่านแหล่งงานไม่ทันเวลาที่กำหนด'
        : 'SOURCE_BROWSER_UNAVAILABLE: เปิดเบราว์เซอร์อ่านแหล่งงานไม่ได้ ให้ตรวจบริการ',
    );
  } finally {
    try {
      await browser?.close();
    } catch {
      /* Do not disclose runtime paths or provider responses. */
    }
    try {
      await display?.close();
    } catch {
      /* Release remains mandatory after cleanup errors. */
    }
    release();
  }
}
