import { BadRequestException } from '@nestjs/common';
import { JobType } from '@prisma/client';
import * as crypto from 'crypto';
import { formatStructuredJobText, jobSections } from './job-detail-content';

export interface LocalJobItemInput {
  id: string;
  title: string;
  company: string;
  logoUrl: string | null;
  companyLogoUrl?: string | null;
  description: string;
  requirements?: string | null;
  benefits?: string | null;
  location?: string;
  isRemote?: boolean;
  employmentType?: string;
  salaryMin?: number | null;
  salaryMax?: number | null;
  salaryCurrency?: string;
  url: string;
}

export interface LocalJobBatchInput {
  version: number;
  source: 'JOBSDB' | 'BLOGNONE';
  collectedAt: string;
  jobs: LocalJobItemInput[];
}

export function validateLocalJobBatch(batch: any): {
  validatedBatch: LocalJobBatchInput;
  digest: string;
} {
  if (!batch || typeof batch !== 'object') {
    throw new BadRequestException('Batch payload must be a JSON object.');
  }

  const rawJson = JSON.stringify(batch);
  if (Buffer.byteLength(rawJson, 'utf8') > 256 * 1024) {
    throw new BadRequestException('Local job batch exceeds maximum size of 256 KiB.');
  }

  if (batch.version !== 1) {
    throw new BadRequestException('Local job batch version must be 1.');
  }

  const source = String(batch.source || '').toUpperCase();
  if (source !== 'JOBSDB' && source !== 'BLOGNONE') {
    throw new BadRequestException('Local job batch only supports JOBSDB and BLOGNONE.');
  }

  const collectedTime = new Date(batch.collectedAt).getTime();
  if (!Number.isFinite(collectedTime)) {
    throw new BadRequestException('Invalid collectedAt timestamp.');
  }

  const now = Date.now();
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
  const fiveMinutesMs = 5 * 60 * 1000;
  if (collectedTime < now - sevenDaysMs) {
    throw new BadRequestException('collectedAt cannot be older than 7 days.');
  }
  if (collectedTime > now + fiveMinutesMs) {
    throw new BadRequestException('collectedAt cannot be more than 5 minutes in the future.');
  }

  const jobs = batch.jobs;
  if (!Array.isArray(jobs) || jobs.length < 1) {
    throw new BadRequestException('jobs must be a non-empty array.');
  }

  const maxJobs = source === 'BLOGNONE' ? 30 : 60;
  if (jobs.length > maxJobs) {
    throw new BadRequestException(
      `${source} local job batch cannot exceed ${maxJobs} jobs.`,
    );
  }

  const seenIds = new Set<string>();
  const seenUrls = new Set<string>();
  const validatedJobs: LocalJobItemInput[] = [];

  jobs.forEach((job, idx) => {
    const label = `jobs[${idx}]`;
    const id = String(job?.id || '').trim();
    const urlStr = String(job?.url || '').trim();

    if (!id || !urlStr) {
      throw new BadRequestException(`${label}: id and url are required.`);
    }

    if (seenIds.has(id)) {
      throw new BadRequestException(`${label}: duplicate job id "${id}" in batch.`);
    }
    if (seenUrls.has(urlStr)) {
      throw new BadRequestException(`${label}: duplicate job url "${urlStr}" in batch.`);
    }
    seenIds.add(id);
    seenUrls.add(urlStr);

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(urlStr);
    } catch {
      throw new BadRequestException(`${label}: invalid URL "${urlStr}".`);
    }

    if (
      parsedUrl.protocol !== 'https:' ||
      parsedUrl.username ||
      parsedUrl.password ||
      parsedUrl.port ||
      parsedUrl.search ||
      parsedUrl.hash
    ) {
      throw new BadRequestException(
        `${label}: URL must be HTTPS without credentials, port, query, or fragment.`,
      );
    }

    if (source === 'JOBSDB') {
      const m = /^https:\/\/th\.jobsdb\.com\/job\/(\d+)$/.exec(urlStr);
      if (!m) {
        throw new BadRequestException(
          `${label}: JOBSDB URL must match https://th.jobsdb.com/job/<digits>`,
        );
      }
      const expectedId = `jobsdb-${m[1]}`;
      if (id !== expectedId) {
        throw new BadRequestException(
          `${label}: JOBSDB id must be "${expectedId}" to match URL.`,
        );
      }
    } else {
      const m = /^https:\/\/jobs\.blognone\.com\/company\/[^/]+\/job\/([a-zA-Z0-9_-]+)$/.exec(
        urlStr,
      );
      if (!m) {
        throw new BadRequestException(
          `${label}: BLOGNONE URL must match https://jobs.blognone.com/company/<company>/job/<slug>`,
        );
      }
      const slug = m[1];
      if (id !== slug && id !== `blognone-${slug}`) {
        throw new BadRequestException(
          `${label}: BLOGNONE id must match job slug "${slug}".`,
        );
      }
    }

    const rawLogo = job.companyLogoUrl ?? job.logoUrl ?? null;
    let normalizedLogo: string | null = null;
    if (rawLogo !== null && rawLogo !== undefined && String(rawLogo).trim() !== '') {
      if (typeof rawLogo !== 'string') {
        throw new BadRequestException(`${label}: logoUrl must be an HTTPS URL string or null.`);
      }
      try {
        const parsedLogo = new URL(rawLogo.trim());
        if (parsedLogo.protocol !== 'https:' || parsedLogo.username || parsedLogo.password) {
          throw new BadRequestException(`${label}: logoUrl must use HTTPS protocol.`);
        }
        normalizedLogo = parsedLogo.href;
      } catch (err: any) {
        if (err instanceof BadRequestException) throw err;
        throw new BadRequestException(`${label}: logoUrl must be a valid HTTPS URL or null.`);
      }
    }

    const title = String(job.title || '').trim();
    const company = String(job.company || '').trim();
    const description = formatStructuredJobText(job.description);
    if (!title || !company || !description) {
      throw new BadRequestException(
        `${label}: title, company, and description must be non-empty.`,
      );
    }
    const sections = jobSections(description);
    const formattedRequirements = job.requirements
      ? formatStructuredJobText(job.requirements)
      : sections.requirements || null;
    const formattedBenefits = job.benefits
      ? formatStructuredJobText(job.benefits)
      : sections.benefits || null;

    const salaryMin =
      job.salaryMin === null || job.salaryMin === undefined
        ? null
        : Number(job.salaryMin);
    const salaryMax =
      job.salaryMax === null || job.salaryMax === undefined
        ? null
        : Number(job.salaryMax);

    if (salaryMin !== null && (!Number.isInteger(salaryMin) || salaryMin < 0)) {
      throw new BadRequestException(`${label}: salaryMin must be a non-negative integer or null.`);
    }
    if (salaryMax !== null && (!Number.isInteger(salaryMax) || salaryMax < 0)) {
      throw new BadRequestException(`${label}: salaryMax must be a non-negative integer or null.`);
    }
    if (salaryMin !== null && salaryMax !== null && salaryMin > salaryMax) {
      throw new BadRequestException(`${label}: salaryMin cannot exceed salaryMax.`);
    }

    const empType = job.employmentType || 'FULL_TIME';
    if (!Object.values(JobType).includes(empType as JobType)) {
      throw new BadRequestException(`${label}: invalid employmentType "${empType}".`);
    }

    validatedJobs.push({
      id,
      title,
      company,
      logoUrl: normalizedLogo,
      companyLogoUrl: normalizedLogo,
      description,
      requirements: formattedRequirements,
      benefits: formattedBenefits,
      location: job.location ? String(job.location).trim() : 'Bangkok, Thailand',
      isRemote: Boolean(job.isRemote),
      employmentType: empType,
      salaryMin,
      salaryMax,
      salaryCurrency: job.salaryCurrency
        ? String(job.salaryCurrency).trim().toUpperCase()
        : 'THB',
      url: urlStr,
    });
  });

  const digest = crypto.createHash('sha256').update(rawJson).digest('hex');

  return {
    validatedBatch: {
      version: 1,
      source: source as 'JOBSDB' | 'BLOGNONE',
      collectedAt: batch.collectedAt,
      jobs: validatedJobs,
    },
    digest,
  };
}
