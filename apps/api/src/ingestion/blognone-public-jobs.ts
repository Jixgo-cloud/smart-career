import axios from 'axios';
import * as cheerio from 'cheerio';
import { JobType } from '@prisma/client';
import {
  blognonePublicEndpoint,
  fetchBlognonePublicHttp2,
} from './blognone-public-http2';

export { blognonePublicEndpoint } from './blognone-public-http2';

function cleanHtmlText(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) return '';
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

// The anonymous getHome + active jobs catalog query published in Blognone's own frontend bundle.
export const blognonePublicQuery = `query getHome {
  home_jobs {
    slug title description skills
    company { slug name_en logo } type province district
    salary_min salary_max salary_display_format
  }
  jobs(offset: 0, limit: 60) {
    slug title description skills
    company { slug name_en logo } type province district
    salary_min salary_max salary_display_format
  }
}`;

export function parseBlognonePublicJobs(payload: any, limit: number) {
  const fail = (): never => {
    throw new Error(
      'SOURCE_DATA_INVALID: ข้อมูลประกาศสาธารณะ Blognone ไม่ครบหรือรูปแบบเปลี่ยน รักษางานเดิมไว้',
    );
  };
  if (
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 100 ||
    (payload?.errors &&
      (!Array.isArray(payload.errors) || payload.errors.length))
  ) {
    fail();
  }
  const homeRows = Array.isArray(payload?.data?.home_jobs)
    ? payload.data.home_jobs
    : [];
  const catalogRows = Array.isArray(payload?.data?.jobs)
    ? payload.data.jobs
    : [];
  const combinedRows = [...homeRows, ...catalogRows];
  if (combinedRows.length === 0 || combinedRows.length > 2000) fail();

  const types: Record<string, JobType> = {
    JOBTYPE_FULL_TIME: JobType.FULL_TIME,
    JOBTYPE_PART_TIME: JobType.PART_TIME,
    JOBTYPE_CONTRACT: JobType.CONTRACT,
    JOBTYPE_INTERNSHIP: JobType.INTERNSHIP,
  };
  const text = (value: unknown, max: number) =>
    typeof value === 'string' &&
    value.trim().length > 0 &&
    value.length <= max &&
    !/[\x00-\x1f\x7f]/.test(value);
  const slug = (value: unknown) =>
    typeof value === 'string' && /^[A-Za-z0-9_-]{1,200}$/.test(value);
  const ids = new Set<string>();
  const jobs: Array<{
    id: string;
    title: string;
    company: string;
    logoUrl: null;
    companyLogoUrl?: string | null;
    description: string;
    location: string;
    isRemote: boolean;
    employmentType: JobType;
    salaryMin: number | null;
    salaryMax: number | null;
    skills?: string[];
    url: string;
  }> = [];

  for (const row of combinedRows) {
    if (
      !slug(row?.slug) ||
      !slug(row?.company?.slug) ||
      !text(row?.title, 300) ||
      !text(row?.company?.name_en, 300) ||
      !Object.prototype.hasOwnProperty.call(types, row?.type)
    ) {
      fail();
    }
    if (ids.has(row.slug)) continue;
    ids.add(row.slug);

    for (const field of ['province', 'district']) {
      if (row[field] != null && row[field] !== '' && !text(row[field], 200)) {
        fail();
      }
    }
    if (
      !['MIN_MAX', 'NOT_APPLICABLE', 'NEGOTIABLE'].includes(
        row.salary_display_format,
      )
    ) {
      fail();
    }
    for (const field of ['salary_min', 'salary_max']) {
      if (
        row[field] != null &&
        (!Number.isSafeInteger(row[field]) ||
          row[field] < 0 ||
          row[field] > 100000000)
      ) {
        fail();
      }
    }
    const visibleRange = row.salary_display_format === 'MIN_MAX';
    const salaryMin =
      visibleRange && row.salary_min > 0 ? row.salary_min : null;
    const salaryMax =
      visibleRange && row.salary_max > 0 ? row.salary_max : null;
    if (
      visibleRange &&
      salaryMin != null &&
      salaryMax != null &&
      salaryMin > salaryMax
    ) {
      fail();
    }

    const title = row.title.trim();
    const cleanedDesc = cleanHtmlText(row.description);
    const skillHints = Array.isArray(row.skills)
      ? row.skills.filter((s: unknown) => typeof s === 'string')
      : [];
    const fullDescription =
      cleanedDesc.length >= 20
        ? skillHints.length > 0
          ? `${cleanedDesc}\n\nSkills: ${skillHints.join(', ')}`
          : cleanedDesc
        : title;

    jobs.push({
      id: row.slug,
      title: title.slice(0, 100),
      company: row.company.name_en.trim(),
      logoUrl: null,
      companyLogoUrl:
        typeof row.company?.logo === 'string' &&
        row.company.logo.startsWith('https://')
          ? row.company.logo
          : null,
      description: fullDescription,
      location:
        [row.district, row.province].filter(Boolean).join(', ') ||
        'Bangkok, Thailand',
      isRemote: /\bremote\b|\bwfh\b|\bhybrid\b/i.test(
        `${title} ${fullDescription}`,
      ),
      employmentType: types[row.type],
      salaryMin,
      salaryMax,
      skills: skillHints,
      url: `https://jobs.blognone.com/company/${row.company.slug}/job/${row.slug}`,
    });
  }
  return jobs.slice(0, limit);
}

export async function fetchBlognonePublicJobs(limit: number) {
  let payload: unknown;
  const body = {
    operationName: 'getHome',
    variables: {},
    query: blognonePublicQuery,
  };
  try {
    const response = await axios.post(blognonePublicEndpoint, body, {
      timeout: 12000,
      maxRedirects: 0,
      maxContentLength: 5 * 1024 * 1024,
      responseType: 'json',
      headers: {
        'User-Agent': 'SmartCareer/1.0',
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
    });
    payload = response.data;
  } catch (error: any) {
    const status = error.response?.status;
    if (status === 403 || !status) {
      payload = await fetchBlognonePublicHttp2(JSON.stringify(body));
    } else {
      throw new Error(
        `SOURCE_HTTP_${status}: API สาธารณะ Blognone ไม่พร้อมให้อ่านข้อมูล รักษางานเดิมไว้`,
      );
    }
  }
  return parseBlognonePublicJobs(payload, limit);
}

export async function fetchBlognoneJobDetailBySlug(
  companySlug: string,
  jobSlug: string,
): Promise<Record<string, any> | null> {
  const query = `query getJob($slug: String!, $company: String!) {
    job(slug: $slug, company: $company) {
      slug title description skills expiration
      company { slug name_en logo }
      type province district salary_min salary_max salary_display_format
    }
  }`;
  const body = JSON.stringify({
    operationName: 'getJob',
    variables: { slug: jobSlug, company: companySlug },
    query,
  });
  const payload = (await fetchBlognonePublicHttp2(body)) as any;
  const job = payload?.data?.job;
  if (!job || !job.description) return null;

  const descriptionText = cleanHtmlText(job.description);
  const skillHints = Array.isArray(job.skills)
    ? job.skills.filter((s: unknown) => typeof s === 'string')
    : [];
  const fullDesc =
    skillHints.length > 0
      ? `${descriptionText}\n\nSkills: ${skillHints.join(', ')}`
      : descriptionText;

  const visibleRange = job.salary_display_format === 'MIN_MAX';
  const salaryMin =
    visibleRange && job.salary_min > 0 ? job.salary_min : undefined;
  const salaryMax =
    visibleRange && job.salary_max > 0 ? job.salary_max : undefined;

  return {
    description: fullDesc,
    location:
      [job.district, job.province].filter(Boolean).join(', ') || undefined,
    logoUrl:
      typeof job.company?.logo === 'string' &&
      job.company.logo.startsWith('https://')
        ? job.company.logo
        : undefined,
    ...(salaryMin !== undefined && salaryMax !== undefined
      ? { salaryMin, salaryMax, salaryCurrency: 'THB' }
      : {}),
  };
}
