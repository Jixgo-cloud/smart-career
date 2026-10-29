import * as cheerio from 'cheerio';
import axios from 'axios';
import { fetchPublicJobHttp2 } from './public-job-http2';
import { fetchBlognoneJobDetailBySlug } from './blognone-public-jobs';

export function jobText(value: unknown): string {
  if (typeof value !== 'string') return '';
  const withStructure = value
    .replace(/\r\n?/g, '\n')
    .replace(/<li\b[^>]*>\s*/gi, (match) => `${match}• `)
    .replace(
      /<(br|\/p|\/li|\/div|\/h[1-6]|\/tr|\/section|\/article|\/ul|\/ol)\b[^>]*>/gi,
      '\n',
    );
  const $ = cheerio.load(withStructure);
  $('script,style').remove();
  return $.text()
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/•\s*([•\-–—*])/g, '$1')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n\s*\n/g, '\n')
    .trim();
}

export function formatStructuredJobText(value: unknown): string {
  const base = jobText(value);
  if (!base) return '';

  // Break inline bullets and inline numbered list items (e.g., Thai JobThai "1.วางแผน...2.จัดให้มี...") onto their own lines
  let formatted = base
    .replace(/([^\n])\s+[•●▪▸]\s+/g, '$1\n• ')
    .replace(/([.:;])\s+-\s+(?=[A-Zก-ฮ0-9])/g, '$1\n• ')
    .replace(/(^|\n)1\.([^\s\d])/g, '$11. $2')
    .replace(/([^\n\d.vV])\s*([2-9]\d?)\.\s*(?=[ก-ฮA-Z])/g, '$1\n$2. ');

  // If the text has no line breaks (or has a huge flattened block > 260 chars), restore section headings & readable paragraphs
  if (!formatted.includes('\n') || formatted.split('\n').some((l) => l.length > 260)) {
    formatted = formatted
      .replace(
        /\s+(?=(?:Key\s+Responsibilities|Responsibilities|Role\s*&\s*Responsibilities|What\s+You(?:'ll|’ll|\s+Will)\s+Do|Your\s+Role|Job\s+Description|Minimum\s+Qualifications|Preferred\s+Qualifications|Qualifications|Technical\s+Requirements|Key\s+Requirements|Requirements|What\s+You(?:'ll|’ll|\s+Will)\s+Need(?:\s+to\s+Succeed)?|What\s+You\s+Bring|Who\s+You\s+Are|Nice\s+to\s+Have|Bonus\s+Points|Perks\s*&\s*Benefits|Compensation\s*&\s*Benefits|Benefits|What\s+We\s+Offer|Why\s+Join\s+Us|About\s+Us|About\s+the\s+Role|Tech\s+Stack|Our\s+Tech\s+Stack|หน้าที่ความรับผิดชอบ|รายละเอียดงาน|คุณสมบัติผู้สมัคร|คุณสมบัติที่ต้องการ|สวัสดิการ|สิ่งที่คุณจะได้รับ)\s*[:：])/gi,
        '\n\n',
      )
      .replace(
        /^((?:Key\s+Responsibilities|Responsibilities|Role\s*&\s*Responsibilities|What\s+You(?:'ll|’ll|\s+Will)\s+Do|Your\s+Role|Job\s+Description|Minimum\s+Qualifications|Preferred\s+Qualifications|Qualifications|Technical\s+Requirements|Key\s+Requirements|Requirements|What\s+You(?:'ll|’ll|\s+Will)\s+Need(?:\s+to\s+Succeed)?|What\s+You\s+Bring|Who\s+You\s+Are|Nice\s+to\s+Have|Bonus\s+Points|Perks\s*&\s*Benefits|Compensation\s*&\s*Benefits|Benefits|What\s+We\s+Offer|Why\s+Join\s+Us|About\s+Us|About\s+the\s+Role|Tech\s+Stack|Our\s+Tech\s+Stack|หน้าที่ความรับผิดชอบ|รายละเอียดงาน|คุณสมบัติผู้สมัคร|คุณสมบัติที่ต้องการ|สวัสดิการ|สิ่งที่คุณจะได้รับ)\s*[:：])\s+/gim,
        '$1\n',
      )
      .replace(/\s+Skills:\s+/g, '\n\nSkills: ');

    // Break very long single-line paragraphs (> 360 chars) into 2-3 sentence paragraphs for readability
    formatted = formatted
      .split('\n')
      .map((line) => {
        const trimmed = line.trim();
        if (trimmed.length <= 360 || trimmed.startsWith('• ') || trimmed.startsWith('- ')) {
          return trimmed;
        }
        const sentences = trimmed.split(/(?<=[.!?])\s+(?=[A-Zก-ฮ])/);
        if (sentences.length <= 2) return trimmed;
        const chunks: string[] = [];
        for (let i = 0; i < sentences.length; i += 2) {
          chunks.push(sentences.slice(i, i + 2).join(' '));
        }
        return chunks.join('\n\n');
      })
      .join('\n');
  }

  return formatted
    .replace(/\n[ \t]+/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function jobSections(description: string) {
  const sections: Record<string, string> = {};
  const lines = description.split('\n');
  let current = '';
  for (const line of lines) {
    const heading = line
      .trim()
      .replace(/^[#*\-•\s]+|\*\*$/g, '')
      .replace(/[:：]$/, '')
      .trim();
    if (
      /^(qualifications?|minimum qualifications?|preferred qualifications?|requirements?|technical requirements?|key requirements?|required skills(?: & qualifications)?|what you(['’]ll| will) need(?: to succeed)?|what you bring|who you are|คุณสมบัติ(?:ผู้สมัคร)?|คุณสมบัติที่ต้องการ)$/i.test(
        heading,
      )
    ) {
      current = 'requirements';
    } else if (
      /^(benefits?|perks?(?: & benefits?)?|compensation(?: & benefits?)?|what we offer|why join us|สวัสดิการ(?:และผลประโยชน์)?|สิ่งที่คุณจะได้รับ)$/i.test(
        heading,
      )
    ) {
      current = 'benefits';
    } else if (
      /^(responsibilities|key responsibilities|role & responsibilities|what you(['’]ll| will) do|your role|about us|about the role|job summary|overview|skills|หน้าที่.*|รายละเอียดงาน|วิธีการสมัคร|ติดต่อ|สถานที่ปฏิบัติงาน)$/i.test(
        heading,
      )
    ) {
      current = '';
    } else if (current) {
      sections[current] = ((sections[current] || '') + '\n' + line).trim();
    }
  }
  return sections;
}

// Only explicitly monthly salaries fit the application's monthly salary fields.
export function monthlySalary(value: any) {
  const q = value?.value || value;
  if (!q || String(q.unitText).toUpperCase() !== 'MONTH') return {};
  const numeric = (n: unknown): number =>
    typeof n === 'string' && /^\d+(\.\d+)?$/.test(n)
      ? Number(n)
      : typeof n === 'number'
        ? n
        : NaN;
  const min = numeric(q.minValue ?? q.value);
  const max = numeric(q.maxValue ?? q.value);
  if (
    !Number.isFinite(min) ||
    !Number.isFinite(max) ||
    min < 0 ||
    max < 0 ||
    min > max
  ) {
    return {};
  }
  // Blognone uses zero/zero for salary not disclosed.
  if (min === 0 && max === 0) return {};
  return {
    salaryMin: min,
    salaryMax: max,
    salaryCurrency: value.currency || 'THB',
  };
}

export function parseJobDetail(html: string, url: string): Record<string, any> {
  const $ = cheerio.load(html);
  const postings: any[] = [];
  const inspect = (obj: any, depth = 0) => {
    if (depth > 8 || !obj) return;
    if (typeof obj === 'string') {
      try {
        inspect(JSON.parse(obj), depth + 1);
      } catch {}
      return;
    }
    if (Array.isArray(obj)) {
      obj.forEach((x) => inspect(x, depth + 1));
      return;
    }
    if (typeof obj !== 'object') return;
    if (
      obj['@type'] === 'JobPosting' &&
      !postings.some((p) => JSON.stringify(p) === JSON.stringify(obj))
    ) {
      postings.push(obj);
    }
    if (obj['@graph']) inspect(obj['@graph'], depth + 1);
    if (obj.type === 'application/ld+json') inspect(obj.children, depth + 1);
  };
  $('script').each((_i, el) => {
    const text = $(el).text();
    if ($(el).attr('type') === 'application/ld+json') inspect(text);
    // Parse Next.js serialized data as JSON; never execute source scripts.
    const match = text.match(/\.push\((\[[\s\S]*\])\);?\s*$/);
    if (match) {
      try {
        inspect(JSON.parse(match[1]));
      } catch {}
    }
  });
  const canonical = (v: string) => {
    try {
      const u = new URL(v, url);
      return u.origin + u.pathname.replace(/\/$/, '');
    } catch {
      return '';
    }
  };
  const resolveHttpsLogo = (raw: unknown): string | undefined => {
    const candidate =
      typeof raw === 'string'
        ? raw.trim()
        : Array.isArray(raw)
          ? typeof raw[0] === 'string'
            ? raw[0].trim()
            : raw[0]?.url || raw[0]?.['@id']
          : typeof raw === 'object' && raw !== null
            ? (raw as any).url || (raw as any)['@id'] || (raw as any).contentUrl
            : '';
    if (typeof candidate !== 'string' || !candidate.trim()) return undefined;
    try {
      const resolved = new URL(candidate.trim(), url);
      return resolved.protocol === 'https:' ? resolved.href : undefined;
    } catch {
      return undefined;
    }
  };
  const exact = postings.filter(
    (p) => p.url && canonical(p.url) === canonical(url),
  );
  const p =
    exact[0] || (postings.length === 1 && !postings[0].url ? postings[0] : null);
  let result: Record<string, any> = {};
  if (p) {
    const locations = Array.isArray(p.jobLocation)
      ? p.jobLocation
      : [p.jobLocation];
    const location = locations
      .map((l: any) => {
        const a = l?.address;
        return typeof a === 'string'
          ? a
          : [
              a?.addressLocality,
              a?.addressRegion,
              typeof a?.addressCountry === 'string'
                ? a.addressCountry
                : a?.addressCountry?.name,
            ]
              .filter(Boolean)
              .join(', ');
      })
      .filter(Boolean)
      .join(' / ');
    result = {
      description: jobText(p.description),
      requirements: jobText(p.qualifications),
      benefits: jobText(p.jobBenefits),
      location,
      logoUrl: resolveHttpsLogo(
        p.hiringOrganization?.logo ?? p.hiringOrganization?.image,
      ),
      ...monthlySalary(p.baseSalary),
    };
  }
  const hostname = new URL(url).hostname;
  if (hostname === 'th.jobsdb.com') {
    const desc = $('[data-automation="jobAdDetails"]').first();
    if (desc.length) result.description = jobText(desc.html());
    result.location ||= $('[data-automation="job-detail-location"]')
      .first()
      .text()
      .trim();
    if (!result.logoUrl) {
      const domLogo = $(
        '[data-automation="company-profile"] img, [data-automation="advertiser-logo"] img, [data-testid="bx-logo-image"] img, img[data-testid="bx-logo-image"], [data-automation="job-detail-logo"] img, img[src*="image-service-cdn.seek.com.au"], img[alt*="Company Logo" i]',
      )
        .first()
        .attr('src');
      result.logoUrl = resolveHttpsLogo(domLogo);
    }
    if (!result.logoUrl) {
      $('script').each((_i, el) => {
        if (result.logoUrl) return;
        const scriptText = $(el).html() || '';
        const seekLogoMatch = scriptText.match(
          /"(?:jdpLogo|serpLogoUrl|serpLogo)"\s*:\s*"(https:\/\/[^"]+)"/,
        );
        if (seekLogoMatch?.[1]) {
          result.logoUrl = resolveHttpsLogo(
            seekLogoMatch[1].replace(/\\u002F/g, '/'),
          );
        }
      });
    }
  }
  if (hostname === 'jobs.blognone.com') {
    const desc = $(
      '.job-description, [itemprop="description"], .col-md-8.css-1wekrze',
    ).first();
    if (!result.description && desc.length) {
      result.description = jobText(desc.html());
    }
    if (!result.logoUrl) {
      const domLogo = $(
        'img[alt*="logo" i], .company-logo img, [itemprop="logo"], img[src*="jobs-static"]',
      )
        .first()
        .attr('src');
      result.logoUrl = resolveHttpsLogo(domLogo);
    }
  }
  if (hostname === 'www.jobthai.com' || hostname === 'jobthai.com') {
    if (!result.logoUrl) {
      const domLogo = $(
        'img[id*="company-logo" i], img[id*="logo" i], img[alt*="logo" i], img[src*="logo" i]',
      )
        .first()
        .attr('src');
      result.logoUrl = resolveHttpsLogo(domLogo);
    }
  }
  const visible = jobText($('body').html());
  if (
    /This job is no longer advertised|ตำแหน่งงานนี้หมดอายุแล้ว/.test(visible)
  ) {
    result.isActive = false;
    if (!result.description) throw new Error('SOURCE_LISTING_CLOSED');
  }
  if (!result.description || result.description.length < 40) {
    throw new Error('SOURCE_DETAIL_MISSING');
  }
  const sections = jobSections(result.description);
  result.requirements ||= sections.requirements;
  result.benefits ||= sections.benefits;
  return Object.fromEntries(
    Object.entries(result).filter(
      ([, v]) => v !== undefined && v !== null && v !== '',
    ),
  );
}

export async function fetchJobDetail(url: string) {
  const allowed = new Set([
    'www.jobthai.com',
    'jobthai.com',
    'th.jobsdb.com',
    'jobs.blognone.com',
  ]);
  let target = new URL(url);

  // Fast path for Blognone job details via HTTP/2 GraphQL API
  if (target.hostname === 'jobs.blognone.com') {
    const m = target.pathname.match(/^\/company\/([^/]+)\/job\/([^/]+)\/?$/);
    if (m) {
      try {
        const gqlDetail = await fetchBlognoneJobDetailBySlug(m[1], m[2]);
        if (gqlDetail && gqlDetail.description && gqlDetail.description.length >= 40) {
          const sections = jobSections(gqlDetail.description);
          return Object.fromEntries(
            Object.entries({
              ...gqlDetail,
              requirements: gqlDetail.requirements || sections.requirements,
              benefits: gqlDetail.benefits || sections.benefits,
            }).filter(([, v]) => v !== undefined && v !== null && v !== ''),
          );
        }
      } catch {
        // Fall through to HTML HTTP/HTTP2 below
      }
    }
  }

  for (let hop = 0; hop < 4; hop++) {
    if (
      target.protocol !== 'https:' ||
      target.username ||
      target.password ||
      target.port ||
      !allowed.has(target.hostname)
    ) {
      throw new Error('SOURCE_DETAIL_URL_DENIED');
    }
    const response = await axios.get(target.href, {
      timeout: 15000,
      maxRedirects: 0,
      maxContentLength: 10 * 1024 * 1024,
      responseType: 'text',
      validateStatus: () => true,
      headers: { 'User-Agent': 'SmartCareer/1.0', Accept: 'text/html' },
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const next = new URL(response.headers.location, target);
      if (next.hostname !== target.hostname) {
        throw new Error('SOURCE_DETAIL_REDIRECT_DENIED');
      }
      target = next;
      continue;
    }
    if (
      response.status === 403 &&
      ['jobs.blognone.com', 'th.jobsdb.com'].includes(target.hostname)
    ) {
      return parseJobDetail(await fetchPublicJobHttp2(target.href), target.href);
    }
    if (response.status !== 200) {
      throw new Error(`SOURCE_HTTP_${response.status}`);
    }
    return parseJobDetail(response.data, target.href);
  }
  throw new Error('SOURCE_DETAIL_REDIRECT_LIMIT');
}
