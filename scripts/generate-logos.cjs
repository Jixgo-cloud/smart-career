const fs = require('fs');
const path = require('path');
const { chromium } = require('@playwright/test');

const OUT_DIR = path.join(__dirname, '..', 'outputs', 'logos');
const PUBLIC_DIR = path.join(__dirname, '..', 'apps', 'web', 'public', 'logos');

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

const FONT_IMPORT = `<style>
  @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@600;700&amp;family=Plus+Jakarta+Sans:wght@600;700;800&amp;display=swap');
  .wordmark {
    font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    font-weight: 800;
    letter-spacing: -0.035em;
  }
  .tagline {
    font-family: 'JetBrains Mono', monospace;
    font-weight: 700;
    letter-spacing: 0.14em;
  }
</style>`;

// ============================================================================
// CONCEPT 1: CODE & CAREER GROWTH ("Ascent Bracket")
// ============================================================================
function getConcept1Defs(prefix = 'c1') {
  return `
    <linearGradient id="${prefix}-bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0F172A" />
      <stop offset="50%" stop-color="#0B132B" />
      <stop offset="100%" stop-color="#050814" />
    </linearGradient>
    <radialGradient id="${prefix}-glow" cx="68%" cy="24%" r="65%">
      <stop offset="0%" stop-color="#1D7AFC" stop-opacity="0.48" />
      <stop offset="55%" stop-color="#00E5FF" stop-opacity="0.14" />
      <stop offset="100%" stop-color="#050814" stop-opacity="0" />
    </radialGradient>
    <linearGradient id="${prefix}-arrow" x1="15%" y1="88%" x2="88%" y2="12%">
      <stop offset="0%" stop-color="#1D7AFC" />
      <stop offset="50%" stop-color="#2584FF" />
      <stop offset="100%" stop-color="#00F0FF" />
    </linearGradient>
    <linearGradient id="${prefix}-bracket-dark" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#FFFFFF" />
      <stop offset="100%" stop-color="#CBD5E1" />
    </linearGradient>
    <linearGradient id="${prefix}-bracket-light" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0F172A" />
      <stop offset="100%" stop-color="#1E293B" />
    </linearGradient>
    <filter id="${prefix}-shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="8" stdDeviation="12" flood-color="#00E5FF" flood-opacity="0.32" />
    </filter>
  `;
}

// Symbol drawn in a 512x512 coordinate space with generous negative space
function getConcept1Symbol(theme = 'dark', prefix = 'c1') {
  const bracketStroke = theme === 'dark' ? `url(#${prefix}-bracket-dark)` : `url(#${prefix}-bracket-light)`;
  const nodeRing = theme === 'dark' ? '#0B132B' : '#FFFFFF';
  return `
    <!-- Left Code Bracket < -->
    <path d="M 142 166 L 52 256 L 142 346"
      fill="none"
      stroke="${bracketStroke}"
      stroke-width="44"
      stroke-linecap="round"
      stroke-linejoin="round" />

    <!-- Right Code Bracket > -->
    <path d="M 370 166 L 460 256 L 370 346"
      fill="none"
      stroke="${bracketStroke}"
      stroke-width="44"
      stroke-linecap="round"
      stroke-linejoin="round" />

    <!-- Rising Career Arrow (Replaces '/' in </> with clean separation) -->
    <g filter="url(#${prefix}-shadow)">
      <path d="M 182 372 L 326 140"
        fill="none"
        stroke="url(#${prefix}-arrow)"
        stroke-width="46"
        stroke-linecap="round" />
      <path d="M 226 134 L 332 134 L 332 240"
        fill="none"
        stroke="url(#${prefix}-arrow)"
        stroke-width="46"
        stroke-linecap="round"
        stroke-linejoin="round" />
    </g>

    <!-- Origin Skill Node on Arrow Base -->
    <circle cx="182" cy="372" r="16" fill="#00F0FF" stroke="${nodeRing}" stroke-width="8" />

    <!-- AI Spark at Top Left -->
    <path d="M 184 106 Q 184 132 210 132 Q 184 132 184 158 Q 184 132 158 132 Q 184 132 184 106 Z"
      fill="#38BDF8" />
  `;
}

// ============================================================================
// CONCEPT 2: SKILL RADAR & MATCH ("HexaRadar Pulse")
// ============================================================================
function getConcept2Defs(prefix = 'c2') {
  return `
    <linearGradient id="${prefix}-bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0B1120" />
      <stop offset="55%" stop-color="#111827" />
      <stop offset="100%" stop-color="#070B14" />
    </linearGradient>
    <radialGradient id="${prefix}-glow" cx="50%" cy="45%" r="60%">
      <stop offset="0%" stop-color="#2584FF" stop-opacity="0.42" />
      <stop offset="60%" stop-color="#6366F1" stop-opacity="0.16" />
      <stop offset="100%" stop-color="#070B14" stop-opacity="0" />
    </radialGradient>
    <linearGradient id="${prefix}-hex" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#38BDF8" />
      <stop offset="50%" stop-color="#1D7AFC" />
      <stop offset="100%" stop-color="#6366F1" />
    </linearGradient>
    <linearGradient id="${prefix}-poly" x1="15%" y1="85%" x2="85%" y2="15%">
      <stop offset="0%" stop-color="#1D7AFC" stop-opacity="0.38" />
      <stop offset="100%" stop-color="#00E5FF" stop-opacity="0.76" />
    </linearGradient>
    <linearGradient id="${prefix}-needle" x1="20%" y1="80%" x2="85%" y2="15%">
      <stop offset="0%" stop-color="#2584FF" />
      <stop offset="100%" stop-color="#00F5D4" />
    </linearGradient>
  `;
}

function getConcept2Symbol(theme = 'dark', prefix = 'c2') {
  const axisColor = theme === 'dark' ? 'rgba(148, 163, 184, 0.30)' : 'rgba(71, 85, 105, 0.28)';
  const innerStroke = theme === 'dark' ? '#FFFFFF' : '#0F172A';
  const centerFill = theme === 'dark' ? '#0F172A' : '#FFFFFF';
  return `
    <!-- Outer Hexagon Frame -->
    <polygon points="256,68 418,162 418,350 256,444 94,350 94,162"
      fill="none"
      stroke="url(#${prefix}-hex)"
      stroke-width="28"
      stroke-linejoin="round" />

    <!-- Radar Spokes / Axes -->
    <g stroke="${axisColor}" stroke-width="8" stroke-linecap="round">
      <line x1="256" y1="68" x2="256" y2="444" />
      <line x1="94" y1="162" x2="418" y2="350" />
      <line x1="94" y1="350" x2="418" y2="162" />
    </g>

    <!-- Asymmetric Skill Radar Polygon -->
    <polygon points="256,118 418,162 366,320 256,396 130,328 150,195"
      fill="url(#${prefix}-poly)"
      stroke="#00E5FF"
      stroke-width="14"
      stroke-linejoin="round" />

    <!-- Matching Vector Needle (Center to Verified Top-Right Job Match Node) -->
    <path d="M 184 328 L 418 162"
      fill="none"
      stroke="url(#${prefix}-needle)"
      stroke-width="30"
      stroke-linecap="round" />

    <!-- Radar Vertex Dots -->
    <circle cx="256" cy="118" r="13" fill="#38BDF8" />
    <circle cx="366" cy="320" r="13" fill="#38BDF8" />
    <circle cx="256" cy="396" r="13" fill="#38BDF8" />
    <circle cx="130" cy="328" r="13" fill="#38BDF8" />
    <circle cx="150" cy="195" r="13" fill="#38BDF8" />

    <!-- Center Core Hub -->
    <circle cx="256" cy="256" r="28" fill="${centerFill}" stroke="${innerStroke}" stroke-width="16" />

    <!-- Highlighted Match Target Node at Top-Right Vertex -->
    <circle cx="418" cy="162" r="32" fill="#00F5D4" stroke="${centerFill}" stroke-width="12" />
  `;
}

// ============================================================================
// CONCEPT 3: MODERN SC MONOGRAM ("Verified SC Monogram")
// ============================================================================
function getConcept3Defs(prefix = 'c3') {
  return `
    <linearGradient id="${prefix}-bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0D1326" />
      <stop offset="50%" stop-color="#090D1A" />
      <stop offset="100%" stop-color="#05070F" />
    </linearGradient>
    <radialGradient id="${prefix}-glow" cx="35%" cy="25%" r="70%">
      <stop offset="0%" stop-color="#3B82F6" stop-opacity="0.42" />
      <stop offset="55%" stop-color="#1D7AFC" stop-opacity="0.18" />
      <stop offset="100%" stop-color="#05070F" stop-opacity="0" />
    </radialGradient>
    <linearGradient id="${prefix}-s-grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#38BDF8" />
      <stop offset="50%" stop-color="#1D7AFC" />
      <stop offset="100%" stop-color="#4F46E5" />
    </linearGradient>
    <linearGradient id="${prefix}-c-grad" x1="0%" y1="100%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#2584FF" />
      <stop offset="50%" stop-color="#00E5FF" />
      <stop offset="100%" stop-color="#00F5D4" />
    </linearGradient>
    <filter id="${prefix}-shadow" x="-15%" y="-15%" width="130%" height="130%">
      <feDropShadow dx="0" dy="8" stdDeviation="10" flood-color="#00E5FF" flood-opacity="0.22" />
    </filter>
  `;
}

// Clean, unmistakable interlocking geometric 'S' (Left) and 'C' + Upward Arrow (Right)
function getConcept3Symbol(theme = 'dark', prefix = 'c3') {
  const cBottomStroke = theme === 'dark' ? '#FFFFFF' : '#0F172A';
  return `
    <!-- Geometric 'S' on the Left Half (x: 68..244, y: 120..392) -->
    <path d="M 232 132
             H 132
             C 92 132, 68 156, 68 194
             C 68 232, 92 256, 136 256
             H 176
             C 220 256, 244 280, 244 318
             C 244 356, 220 380, 176 380
             H 76"
      fill="none"
      stroke="url(#${prefix}-s-grad)"
      stroke-width="46"
      stroke-linecap="round"
      stroke-linejoin="round" />

    <!-- Geometric 'C' on the Right Half with Rising Career Arrow Terminal (x: 280..448) -->
    <g filter="url(#${prefix}-shadow)">
      <!-- Main C curve + upward diagonal shaft -->
      <path d="M 432 332
               C 412 364, 380 380, 342 380
               C 298 380, 272 346, 272 256
               C 272 166, 298 132, 346 132
               H 436"
        fill="none"
        stroke="url(#${prefix}-c-grad)"
        stroke-width="46"
        stroke-linecap="round"
        stroke-linejoin="round" />

      <!-- Arrowhead at Top-Right of 'C' (Career Growth / Verified) -->
      <path d="M 382 86 L 444 132 L 382 178"
        fill="none"
        stroke="url(#${prefix}-c-grad)"
        stroke-width="42"
        stroke-linecap="round"
        stroke-linejoin="round" />
    </g>

    <!-- White/Navy Accent Core Dot between S and C -->
    <circle cx="348" cy="256" r="18" fill="${cBottomStroke}" />
  `;
}

// ============================================================================
// SVG GENERATORS FOR EACH CONCEPT
// ============================================================================
const CONCEPTS = [
  {
    id: 'concept-1-code-growth',
    title: 'Concept 1 — Code & Career Growth (Ascent Bracket)',
    subtitle: 'สัญลักษณ์โค้ด </> ผสานลูกศรพุ่งทะยานขึ้น สื่อถึงการประเมินทักษะโค้ดจริงและความก้าวหน้าในสายอาชีพ',
    prefix: 'c1',
    getDefs: getConcept1Defs,
    getSymbol: getConcept1Symbol,
  },
  {
    id: 'concept-2-skill-radar',
    title: 'Concept 2 — Skill Radar & Match (HexaRadar Pulse)',
    subtitle: 'เรดาร์ทักษะ 6 มิติผสานเข็มทิศจับคู่ตำแหน่งงาน (Verified Match Node) สะท้อนฟีเจอร์หลักของแพลตฟอร์ม',
    prefix: 'c2',
    getDefs: getConcept2Defs,
    getSymbol: getConcept2Symbol,
  },
  {
    id: 'concept-3-sc-monogram',
    title: 'Concept 3 — Modern SC Monogram (Verified SC Vector)',
    subtitle: 'ตัวอักษรย่อ SC ทรงเรขาคณิตผสานหัวลูกศรพุ่งทะยาน เรียบหรูระดับ Enterprise Tech Platform',
    prefix: 'c3',
    getDefs: getConcept3Defs,
    getSymbol: getConcept3Symbol,
  },
];

function buildAppIconSvg(concept) {
  const p = concept.prefix;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
  <defs>
    ${concept.getDefs(p)}
    <linearGradient id="${p}-border" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#38BDF8" stop-opacity="0.45" />
      <stop offset="50%" stop-color="#1E293B" stop-opacity="0.2" />
      <stop offset="100%" stop-color="#1D7AFC" stop-opacity="0.35" />
    </linearGradient>
  </defs>
  <!-- Squircle App Icon Base -->
  <rect x="32" y="32" width="960" height="960" rx="224" fill="url(#${p}-bg)" />
  <rect x="32" y="32" width="960" height="960" rx="224" fill="url(#${p}-glow)" />
  <rect x="36" y="36" width="952" height="952" rx="220" fill="none" stroke="url(#${p}-border)" stroke-width="8" />

  <!-- Subtle Grid Texture -->
  <g stroke="rgba(255,255,255,0.03)" stroke-width="2">
    <line x1="256" y1="32" x2="256" y2="992" />
    <line x1="512" y1="32" x2="512" y2="992" />
    <line x1="768" y1="32" x2="768" y2="992" />
    <line x1="32" y1="256" x2="992" y2="256" />
    <line x1="32" y1="512" x2="992" y2="512" />
    <line x1="32" y1="768" x2="992" y2="768" />
  </g>

  <!-- Centered Symbol scaled 1.65x -->
  <g transform="translate(89.6, 89.6) scale(1.65)">
    ${concept.getSymbol('dark', p)}
  </g>
</svg>`;
}

function buildStandaloneMarkSvg(concept, theme = 'dark') {
  const p = `${concept.prefix}-${theme}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
  <defs>
    ${concept.getDefs(p)}
  </defs>
  <g transform="translate(64, 64) scale(1.75)">
    ${concept.getSymbol(theme, p)}
  </g>
</svg>`;
}

function buildHorizontalLockupSvg(concept, theme = 'dark', withBackground = false) {
  const p = `${concept.prefix}-lock-${theme}`;
  const isDark = theme === 'dark';
  const bgRect = withBackground
    ? `<rect x="0" y="0" width="1600" height="480" rx="32" fill="${isDark ? '#0B0F17' : '#FFFFFF'}" />`
    : '';
  const primaryText = isDark ? '#FFFFFF' : '#0F172A';
  const accentText = isDark ? '#38BDF8' : '#1D7AFC';
  const taglineText = isDark ? '#94A3B8' : '#475569';
  const badgeBg = isDark ? '#161F33' : '#EFF6FF';
  const badgeBorder = isDark ? '#1E3A8A' : '#BFDBFE';

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 480" width="1600" height="480">
  <defs>
    ${concept.getDefs(p)}
    <linearGradient id="${p}-word-grad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#1D7AFC" />
      <stop offset="100%" stop-color="${isDark ? '#00E5FF' : '#2563EB'}" />
    </linearGradient>
  </defs>
  ${FONT_IMPORT}
  ${bgRect}

  <!-- Left Icon Badge -->
  <g transform="translate(72, 64)">
    <rect x="0" y="0" width="352" height="352" rx="84" fill="url(#${p}-bg)" />
    <rect x="0" y="0" width="352" height="352" rx="84" fill="url(#${p}-glow)" />
    <rect x="2" y="2" width="348" height="348" rx="82" fill="none" stroke="rgba(56,189,248,0.35)" stroke-width="4" />
    <g transform="translate(28, 28) scale(0.578)">
      ${concept.getSymbol('dark', p)}
    </g>
  </g>

  <!-- Right Brand Typography -->
  <g transform="translate(472, 0)">
    <!-- Wordmark: Smart + Career -->
    <text x="0" y="242" class="wordmark" font-size="152" fill="${primaryText}">
      Smart<tspan fill="url(#${p}-word-grad)">Career</tspan>
    </text>

    <!-- Subtitle Pill + Tagline -->
    <rect x="4" y="288" width="164" height="48" rx="14" fill="${badgeBg}" stroke="${badgeBorder}" stroke-width="2" />
    <text x="86" y="319" text-anchor="middle" class="tagline" font-size="21" fill="${accentText}">VERIFIED</text>
    <text x="192" y="320" class="tagline" font-size="23" fill="${taglineText}">SKILL ASSESSMENT &amp; JOB MATCHING</text>
  </g>
</svg>`;
}

async function main() {
  ensureDir(OUT_DIR);
  ensureDir(PUBLIC_DIR);

  const renderTasks = [];

  for (const concept of CONCEPTS) {
    const cOutDir = path.join(OUT_DIR, concept.id);
    const cPubDir = path.join(PUBLIC_DIR, concept.id);
    ensureDir(cOutDir);
    ensureDir(cPubDir);

    const files = [
      {
        name: 'icon',
        svg: buildAppIconSvg(concept),
        width: 1024,
        height: 1024,
        omitBackground: true,
      },
      {
        name: 'mark-dark',
        svg: buildStandaloneMarkSvg(concept, 'dark'),
        width: 1024,
        height: 1024,
        omitBackground: true,
      },
      {
        name: 'mark-light',
        svg: buildStandaloneMarkSvg(concept, 'light'),
        width: 1024,
        height: 1024,
        omitBackground: true,
      },
      {
        name: 'logo-dark',
        svg: buildHorizontalLockupSvg(concept, 'dark', false),
        width: 1600,
        height: 480,
        omitBackground: true,
      },
      {
        name: 'logo-light',
        svg: buildHorizontalLockupSvg(concept, 'light', false),
        width: 1600,
        height: 480,
        omitBackground: true,
      },
      {
        name: 'banner-dark',
        svg: buildHorizontalLockupSvg(concept, 'dark', true),
        width: 1600,
        height: 480,
        omitBackground: true,
      },
      {
        name: 'banner-light',
        svg: buildHorizontalLockupSvg(concept, 'light', true),
        width: 1600,
        height: 480,
        omitBackground: true,
      },
    ];

    for (const f of files) {
      const svgOutPath = path.join(cOutDir, `${f.name}.svg`);
      const svgPubPath = path.join(cPubDir, `${f.name}.svg`);
      fs.writeFileSync(svgOutPath, f.svg, 'utf8');
      fs.writeFileSync(svgPubPath, f.svg, 'utf8');

      renderTasks.push({
        svg: f.svg,
        width: f.width,
        height: f.height,
        omitBackground: f.omitBackground,
        pngOutPath: path.join(cOutDir, `${f.name}.png`),
        pngPubPath: path.join(cPubDir, `${f.name}.png`),
      });
    }
  }

  const browser = await chromium.launch();
  const context = await browser.newContext({ deviceScaleFactor: 1 });
  const page = await context.newPage();

  for (const task of renderTasks) {
    await page.setViewportSize({ width: task.width, height: task.height });
    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@600;700&family=Plus+Jakarta+Sans:wght@600;700;800&display=swap" rel="stylesheet">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: ${task.width}px; height: ${task.height}px; overflow: hidden; background: transparent; }
    svg { display: block; width: 100%; height: 100%; }
  </style>
</head>
<body>${task.svg}</body>
</html>`;
    await page.setContent(html, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({
      path: task.pngOutPath,
      omitBackground: task.omitBackground,
    });
    fs.copyFileSync(task.pngOutPath, task.pngPubPath);
  }

  const showcaseHtml = `<!DOCTYPE html>
<html lang="th">
<head>
  <meta charset="utf-8" />
  <title>SmartCareer — Brand Identity & Logo Concepts</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Thai:wght@400;500;600;700&family=JetBrains+Mono:wght@600;700&family=Plus+Jakarta+Sans:wght@600;700;800&display=swap" rel="stylesheet">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      background: #070B14;
      color: #F8FAFC;
      font-family: 'Plus Jakarta Sans', 'IBM Plex Sans Thai', sans-serif;
      padding: 48px;
      width: 1800px;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      border-bottom: 1px solid rgba(255,255,255,0.1);
      padding-bottom: 24px;
      margin-bottom: 36px;
    }
    .header h1 {
      font-size: 36px;
      font-weight: 800;
      letter-spacing: -0.02em;
    }
    .header h1 span { color: #38BDF8; }
    .header p { color: #94A3B8; font-size: 16px; margin-top: 6px; }
    .badge {
      font-family: 'JetBrains Mono', monospace;
      font-size: 13px;
      color: #38BDF8;
      background: rgba(29, 122, 252, 0.15);
      border: 1px solid rgba(56, 189, 248, 0.3);
      padding: 8px 16px;
      border-radius: 999px;
    }
    .concept-section {
      background: #0F172A;
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 24px;
      padding: 32px;
      margin-bottom: 32px;
    }
    .concept-header {
      margin-bottom: 24px;
    }
    .concept-header h2 {
      font-size: 24px;
      font-weight: 800;
      color: #FFFFFF;
    }
    .concept-header p {
      font-size: 15px;
      color: #94A3B8;
      margin-top: 4px;
    }
    .grid {
      display: grid;
      grid-template-columns: 260px 260px 1fr 1fr;
      gap: 20px;
      align-items: stretch;
    }
    .card {
      border-radius: 18px;
      padding: 20px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      position: relative;
      border: 1px solid rgba(255,255,255,0.08);
    }
    .card-dark { background: #090D16; }
    .card-checker {
      background-color: #111827;
      background-image: radial-gradient(rgba(255,255,255,0.08) 1px, transparent 1px);
      background-size: 16px 16px;
    }
    .card-light {
      background: #F8FAFC;
      border-color: #E2E8F0;
    }
    .card-label {
      position: absolute;
      top: 12px;
      left: 16px;
      font-family: 'JetBrains Mono', monospace;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: #64748B;
    }
    .card svg {
      max-width: 100%;
      height: auto;
    }
    .icon-wrap svg { width: 168px; height: 168px; }
    .lockup-wrap svg { width: 100%; max-height: 155px; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <h1>Smart<span>Career</span> — Brand Logo Exploration</h1>
      <p>เปรียบเทียบโลโก้ทั้ง 3 แนวคิด (App Icon, Standalone Mark, Dark Lockup และ Light Lockup)</p>
    </div>
    <div class="badge">SVG + HIGH-RES PNG READY</div>
  </div>

  ${CONCEPTS.map(
    (c) => `
    <div class="concept-section">
      <div class="concept-header">
        <h2>${c.title}</h2>
        <p>${c.subtitle}</p>
      </div>
      <div class="grid">
        <div class="card card-dark icon-wrap">
          <span class="card-label">App Icon (1024px)</span>
          ${buildAppIconSvg(c)}
        </div>
        <div class="card card-checker icon-wrap">
          <span class="card-label">Symbol Mark (Transparent)</span>
          ${buildStandaloneMarkSvg(c, 'dark')}
        </div>
        <div class="card card-dark lockup-wrap">
          <span class="card-label">Horizontal Lockup — Dark Mode</span>
          ${buildHorizontalLockupSvg(c, 'dark', false)}
        </div>
        <div class="card card-light lockup-wrap">
          <span class="card-label">Horizontal Lockup — Light Mode</span>
          ${buildHorizontalLockupSvg(c, 'light', false)}
        </div>
      </div>
    </div>
  `
  ).join('\n')}
</body>
</html>`;

  const showcaseHtmlPath = path.join(OUT_DIR, 'SmartCareer_Logo_Showcase.html');
  const showcasePngPath = path.join(OUT_DIR, 'SmartCareer_Logo_Showcase.png');
  fs.writeFileSync(showcaseHtmlPath, showcaseHtml, 'utf8');

  await page.setViewportSize({ width: 1800, height: 1420 });
  await page.setContent(showcaseHtml, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: showcasePngPath, fullPage: true });

  await browser.close();
  console.log('Successfully regenerated all SmartCareer logo SVGs and high-res PNGs!');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
