import { Injectable, NotFoundException } from '@nestjs/common';
import { ApplicationStatus, JobSource, JobType, Prisma, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MatchingService } from '../matching/matching.service';
import { resolveCareerDefinition } from '@smartcareer/shared';

@Injectable()
export class JobsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly matchingService: MatchingService,
  ) {}

  async searchJobs(
    query: {
      keyword?: string;
      location?: string;
      isRemote?: string;
      employmentType?: string;
      source?: string;
      career?: string;
      sortBy?: string;
      page?: string | number;
      limit?: string | number;
    },
    currentUser?: any,
  ) {
    const rawPage = Number(query.page ?? 1);
    const rawLimit = Number(query.limit ?? 20);
    const page = Number.isFinite(rawPage)
      ? Math.max(1, Math.min(10000, Math.floor(rawPage)))
      : 1;
    const limit = Number.isFinite(rawLimit)
      ? Math.max(1, Math.min(100, Math.floor(rawLimit)))
      : 20;

    const where: Prisma.JobWhereInput = {
      isActive: true,
      skills: { some: {} },
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    };

    const andConditions: Prisma.JobWhereInput[] = [];

    if (query.keyword && query.keyword.trim()) {
      const kw = query.keyword.trim();
      andConditions.push({
        OR: [
          { title: { contains: kw, mode: 'insensitive' } },
          { description: { contains: kw, mode: 'insensitive' } },
          { companyName: { contains: kw, mode: 'insensitive' } },
          {
            skills: {
              some: {
                skill: {
                  name: { contains: kw, mode: 'insensitive' },
                },
              },
            },
          },
        ],
      });
    }

    if (query.location && query.location.trim()) {
      andConditions.push({
        location: { contains: query.location.trim(), mode: 'insensitive' },
      });
    }

    if (query.isRemote === 'true') {
      andConditions.push({ isRemote: true });
    } else if (query.isRemote === 'false') {
      andConditions.push({ isRemote: false });
    }

    if (
      query.employmentType &&
      Object.values(JobType).includes(query.employmentType as JobType)
    ) {
      andConditions.push({ employmentType: query.employmentType as JobType });
    }

    if (query.source && Object.values(JobSource).includes(query.source as JobSource)) {
      andConditions.push({ source: query.source as JobSource });
    }

    if (query.career && query.career.trim()) {
      const careerDef = resolveCareerDefinition(query.career);
      if (careerDef) {
        andConditions.push({
          OR: careerDef.keywords.map((kw) => ({
            title: { contains: kw, mode: 'insensitive' as const },
          })),
        });
      } else {
        andConditions.push({
          title: { contains: query.career.trim(), mode: 'insensitive' },
        });
      }
    }

    if (andConditions.length > 0) {
      where.AND = andConditions;
    }

    const isCandidate =
      currentUser?.role === UserRole.CANDIDATE && Boolean(currentUser?.candidateProfile?.id);
    const candidateId: string | null = isCandidate ? currentUser.candidateProfile.id : null;

    let favoriteJobIds = new Set<string>();
    if (candidateId) {
      const favs = await this.prisma.jobFavorite.findMany({
        where: { candidateId },
        select: { jobId: true },
      });
      favoriteJobIds = new Set(favs.map((f) => f.jobId));
    }

    // When sorting by matchScore for a candidate, compute match across matching jobs before slicing page
    if (query.sortBy === 'matchScore' && candidateId) {
      const allJobs = await this.prisma.job.findMany({
        where,
        include: {
          company: {
            select: {
              id: true,
              name: true,
              slug: true,
              logoUrl: true,
              verificationStatus: true,
            },
          },
          skills: {
            include: { skill: true },
          },
        },
        orderBy: { publishedAt: 'desc' },
      });

      const matchMap = await this.matchingService.matchJobsBatch(candidateId, allJobs as any);
      const enriched = allJobs.map((job) => {
        const match = matchMap.get(job.id)!;
        return {
          ...job,
          matchScore: match.matchScore,
          matchAssessment: match,
          isFavorited: favoriteJobIds.has(job.id),
        };
      });

      enriched.sort((a, b) => {
        if (a.matchScore === null && b.matchScore === null) return 0;
        if (a.matchScore === null) return 1;
        if (b.matchScore === null) return -1;
        return b.matchScore - a.matchScore;
      });

      const total = enriched.length;
      const totalPages = Math.max(1, Math.ceil(total / limit));
      const paged = enriched.slice((page - 1) * limit, page * limit);

      return {
        jobs: paged,
        total,
        page,
        totalPages,
      };
    }

    const orderBy: Prisma.JobOrderByWithRelationInput =
      query.sortBy === 'salary'
        ? { salaryMax: { sort: 'desc', nulls: 'last' } }
        : { publishedAt: 'desc' };

    const [total, rawJobs] = await Promise.all([
      this.prisma.job.count({ where }),
      this.prisma.job.findMany({
        where,
        include: {
          company: {
            select: {
              id: true,
              name: true,
              slug: true,
              logoUrl: true,
              verificationStatus: true,
            },
          },
          skills: {
            include: { skill: true },
          },
        },
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    let jobsResult: any[] = rawJobs;
    if (candidateId) {
      const matchMap = await this.matchingService.matchJobsBatch(candidateId, rawJobs as any);
      jobsResult = rawJobs.map((job) => {
        const match = matchMap.get(job.id)!;
        return {
          ...job,
          matchScore: match.matchScore,
          matchAssessment: match,
          isFavorited: favoriteJobIds.has(job.id),
        };
      });
    }

    return {
      jobs: jobsResult,
      total,
      page,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  async getJobPublic(jobId: string) {
    const job = await this.prisma.job.findUnique({
      where: { id: jobId },
      include: {
        company: {
          select: {
            id: true,
            name: true,
            slug: true,
            description: true,
            website: true,
            address: true,
            logoUrl: true,
            verificationStatus: true,
          },
        },
        skills: {
          include: { skill: true },
        },
        customAssessment: {
          select: {
            id: true,
            title: true,
            type: true,
            timeLimitMinutes: true,
          },
        },
        applications: {
          where: { status: ApplicationStatus.ACCEPTED },
          select: { id: true },
        },
      },
    });

    if (!job) {
      throw new NotFoundException('Job not found.');
    }

    if (job.isActive && job.expiresAt && job.expiresAt.getTime() <= Date.now()) {
      await this.prisma.job
        .update({
          where: { id: job.id },
          data: { isActive: false },
        })
        .catch(() => {});
      job.isActive = false;
    }

    const { applications, ...restJob } = job;
    return {
      ...restJob,
      acceptedCount: applications ? applications.length : 0,
    };
  }

  async getJobDetail(jobId: string, currentUser?: any) {
    const job = await this.getJobPublic(jobId);

    const isCandidate =
      currentUser?.role === UserRole.CANDIDATE && Boolean(currentUser?.candidateProfile?.id);
    if (!isCandidate) {
      return job;
    }

    const candidateId = currentUser.candidateProfile.id;
    const [matchAssessment, favorite, latestApplication] = await Promise.all([
      this.matchingService.matchSingleJob(candidateId, job.id),
      this.prisma.jobFavorite.findUnique({
        where: {
          candidateId_jobId: {
            candidateId,
            jobId: job.id,
          },
        },
      }),
      this.prisma.jobApplication.findFirst({
        where: { jobId: job.id, candidateId },
        orderBy: [{ roundNumber: 'desc' }, { createdAt: 'desc' }],
      }),
    ]);

    return {
      ...job,
      matchScore: matchAssessment,
      matchAssessment,
      isFavorited: Boolean(favorite),
      myApplication: latestApplication || null,
    };
  }

  async getJobMatch(jobId: string, currentUser: any) {
    const candidateId = currentUser?.candidateProfile?.id;
    if (!candidateId) {
      throw new NotFoundException('Candidate profile not found.');
    }
    return this.matchingService.matchSingleJob(candidateId, jobId);
  }

  async toggleFavorite(jobId: string, currentUser: any) {
    const candidateId = currentUser?.candidateProfile?.id;
    if (!candidateId) {
      throw new NotFoundException('Candidate profile not found.');
    }

    const job = await this.prisma.job.findUnique({ where: { id: jobId } });
    if (!job) {
      throw new NotFoundException('Job not found.');
    }

    const existing = await this.prisma.jobFavorite.findUnique({
      where: {
        candidateId_jobId: {
          candidateId,
          jobId,
        },
      },
    });

    if (existing) {
      await this.prisma.jobFavorite.delete({ where: { id: existing.id } });
      return {
        isFavorited: false,
        message: 'Removed job from favorites.',
      };
    }

    await this.prisma.jobFavorite.create({
      data: {
        candidateId,
        jobId,
      },
    });

    return {
      isFavorited: true,
      message: 'Added job to favorites.',
    };
  }

  async getMyFavorites(currentUser: any) {
    const candidateId = currentUser?.candidateProfile?.id;
    if (!candidateId) {
      throw new NotFoundException('Candidate profile not found.');
    }

    const favs = await this.prisma.jobFavorite.findMany({
      where: {
        candidateId,
        job: {
          isActive: true,
          skills: { some: {} },
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
      },
      include: {
        job: {
          include: {
            company: {
              select: {
                id: true,
                name: true,
                slug: true,
                logoUrl: true,
                verificationStatus: true,
              },
            },
            skills: {
              include: { skill: true },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const jobs = favs.map((f) => f.job);
    const matchMap = await this.matchingService.matchJobsBatch(candidateId, jobs as any);

    return favs.map((f) => {
      const match = matchMap.get(f.jobId) || null;
      return {
        ...f.job,
        favoritedAt: f.createdAt,
        isFavorited: true,
        matchScore: match ? match.matchScore : null,
        matchAssessment: match,
      };
    });
  }
}
