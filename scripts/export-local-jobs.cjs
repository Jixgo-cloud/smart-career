// Fresh browser / HTTP2 scraping only. This script never loads .env, signs in, or writes to a database.
const fs = require('node:fs');
const path = require('node:path');
const { IngestionService } = require('../apps/api/dist/ingestion/ingestion.service');
const args = process.argv.slice(2);
const option = (name, fallback) =>
  args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
const source = option('--source', 'JOBSDB');
const htmlFile = option('--html', undefined);
const limit = Number(option('--limit', '10'));
const out = path.resolve(
  option('--out', `outputs/local-jobs/${source.toLowerCase()}-${Date.now()}.json`),
);
if (
  args.some(
    (value, index) =>
      index % 2 === 0 && !['--source', '--limit', '--out', '--html'].includes(value),
  ) ||
  args.length % 2 ||
  !['JOBSDB', 'BLOGNONE'].includes(source) ||
  !Number.isInteger(limit) ||
  limit < 1 ||
  limit > 60 ||
  !out.endsWith('.json')
) {
  console.error(
    'Usage: node scripts/export-local-jobs.cjs --source JOBSDB|BLOGNONE --limit 10 --out outputs/local-jobs/jobs.json [--html public-cards.html]',
  );
  process.exit(1);
}
if (!process.env.PUPPETEER_EXECUTABLE_PATH) {
  const candidates =
    process.platform === 'win32'
      ? [
          'C:/Program Files/Google/Chrome/Application/chrome.exe',
          'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
        ]
      : [
          '/usr/bin/google-chrome',
          '/usr/bin/chromium',
          '/usr/bin/chromium-browser',
        ];
  const executable = candidates.find((candidate) => fs.existsSync(candidate));
  if (executable) process.env.PUPPETEER_EXECUTABLE_PATH = executable;
}
(async () => {
  const service = new IngestionService(null, null, null);
  let capturedAt;
  if (htmlFile) {
    if (
      !htmlFile.toLowerCase().endsWith('.html') ||
      fs.statSync(htmlFile).size > 25 * 1024 * 1024
    ) {
      throw new Error('SOURCE_HTML_INVALID');
    }
    capturedAt = fs.statSync(htmlFile).mtime.toISOString();
    const html = fs.readFileSync(htmlFile, 'utf8');
    service.fetchJobSourceHtml = async () => html;
  }
  const batch = await service.collectLocalJobs(source, limit);
  if (capturedAt) batch.collectedAt = capturedAt;
  require('../apps/api/dist/ingestion/local-job-batch').validateLocalJobBatch(batch);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(batch, null, 2), { flag: 'wx' });
  console.log(
    JSON.stringify({
      source,
      count: batch.jobs.length,
      collectedAt: batch.collectedAt,
      output: out,
    }),
  );
})().catch((error) => {
  console.error(
    error?.code === 'EEXIST'
      ? 'OUTPUT_ALREADY_EXISTS: เลือกชื่อไฟล์ใหม่ รักษาไฟล์เดิมไว้'
      : /SOURCE_[A-Z_0-9]+/.exec(error?.message || '')?.[0] ||
          'LOCAL_EXPORT_FAILED: ไม่ได้สร้างไฟล์งาน กรุณาตรวจต้นทางหรือเบราว์เซอร์',
  );
  process.exitCode = 1;
});
