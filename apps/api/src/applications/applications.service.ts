import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ApplicationStatus, JobSource, NotificationType, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MatchingService } from '../matching/matching.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class ApplicationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly matchingService: MatchingService,
    private readonly notifications: NotificationsService,
  ) {}

  async applyToJob(
    user: any,
    jobId: string,
    body: { coverLetter?: string; resumeUrl?: string },
  ) {
    const candidateId = user?.candidateProfile?.id;
    if (!candidateId) {
      throw new NotFoundException('Candidate profile not found.');
    }

    const job = await this.prisma.job.findUnique({
      where: { id: jobId },
      include: {
        skills: { include: { skill: true } },
        company: { include: { members: true } },
      },
    });

    if (!job) {
      throw new NotFoundException('Job not found.');
    }

    if (!job.isActive || (job.expiresAt && job.expiresAt.getTime() <= Date.now())) {
      throw new BadRequestException('This job is closed or has expired.');
    }

    // Enforce Section 16 requirement: external jobs must be applied at their sourceUrl
    if (job.source !== JobSource.INTERNAL || job.sourceUrl) {
      throw new BadRequestException(
        'External jobs must be applied directly on the original source website.',
      );
    }

    if (body.coverLetter && String(body.coverLetter).length > 10000) {
      throw new BadRequestException('coverLetter must not exceed 10000 characters.');
    }

    if (body.resumeUrl) {
      const urlStr = String(body.resumeUrl).trim();
      if (urlStr && !/^https?:\/\//i.test(urlStr)) {
        throw new BadRequestException('resumeUrl must be a valid HTTP/HTTPS URL.');
      }
    }

    // Check latest application for this candidate & job
    const latestApplication = await this.prisma.jobApplication.findFirst({
      where: { jobId, candidateId },
      orderBy: [{ roundNumber: 'desc' }, { createdAt: 'desc' }],
    });

    if (
      latestApplication &&
      latestApplication.status !== ApplicationStatus.CANCELLED &&
      latestApplication.status !== ApplicationStatus.REJECTED
    ) {
      throw new ConflictException(
        'You already have an active application for this job.',
      );
    }

    const nextRound = latestApplication ? latestApplication.roundNumber + 1 : 1;
    const matchAssessment = await this.matchingService.matchSingleJob(candidateId, jobId);

    const created = await this.prisma.$transaction(async (tx) => {
      const app = await tx.jobApplication.create({
        data: {
          jobId,
          candidateId,
          status: ApplicationStatus.APPLIED,
          roundNumber: nextRound,
          coverLetter: body.coverLetter ? String(body.coverLetter).trim() : null,
          resumeUrl: body.resumeUrl ? String(body.resumeUrl).trim() : null,
          matchScoreAtApplication: matchAssessment.matchScore,
          matchAssessmentSnapshot: matchAssessment as any,
          assignedAssessmentId: job.customAssessmentId ?? null,
        },
      });

      await tx.applicationStatusHistory.create({
        data: {
          applicationId: app.id,
          previousStatus: null,
          newStatus: ApplicationStatus.APPLIED,
          changedById: user.id,
          note: `Applied (Round ${nextRound})`,
        },
      });

      return tx.jobApplication.findUnique({
        where: { id: app.id },
        include: {
          job: {
            select: { id: true, title: true, companyName: true },
          },
          statusHistory: true,
        },
      });
    });

    // Notify company members
    for (const member of job.company?.members || []) {
      await this.notifications.createNotification({
        userId: member.userId,
        type: NotificationType.APPLICATION_STATUS_CHANGED,
        title: 'ใบสมัครงานใหม่',
        message: `${user.candidateProfile.fullName} ได้สมัครตำแหน่ง ${job.title}`,
        link: `/company/applications?jobId=${job.id}`,
        metadata: { applicationId: created?.id, jobId: job.id },
      });
    }

    return created;
  }

  async cancelApplication(user: any, applicationId: string) {
    const candidateId = user?.candidateProfile?.id;
    const application = await this.prisma.jobApplication.findUnique({
      where: { id: applicationId },
      include: {
        job: {
          include: {
            company: { include: { members: true } },
          },
        },
        candidate: {
          select: { fullName: true },
        },
      },
    });

    if (!application) {
      throw new NotFoundException('Application not found.');
    }

    if (application.candidateId !== candidateId) {
      throw new ForbiddenException('You can only cancel your own job applications.');
    }

    if (
      application.status === ApplicationStatus.ACCEPTED ||
      application.status === ApplicationStatus.REJECTED ||
      application.status === ApplicationStatus.CANCELLED
    ) {
      throw new BadRequestException(
        `Cannot cancel an application with status ${application.status}.`,
      );
    }

    const cancelled = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.jobApplication.update({
        where: { id: application.id },
        data: { status: ApplicationStatus.CANCELLED },
        include: {
          job: { select: { id: true, title: true, companyName: true } },
          statusHistory: { orderBy: { createdAt: 'asc' } },
        },
      });

      await tx.applicationStatusHistory.create({
        data: {
          applicationId: application.id,
          previousStatus: application.status,
          newStatus: ApplicationStatus.CANCELLED,
          changedById: user.id,
          note: 'Cancelled by candidate',
        },
      });

      return updated;
    });

    const candidateName =
      application.candidate?.fullName ||
      user?.candidateProfile?.fullName ||
      user?.email ||
      'ผู้สมัคร';

    for (const member of application.job?.company?.members || []) {
      await this.notifications.createNotification({
        userId: member.userId,
        type: NotificationType.APPLICATION_STATUS_CHANGED,
        title: 'ผู้สมัครยกเลิกใบสมัครงาน',
        message: `${candidateName} ได้ยกเลิกใบสมัครในตำแหน่ง ${application.job.title}`,
        link: `/company/applications?jobId=${application.jobId}`,
        metadata: {
          applicationId: application.id,
          jobId: application.jobId,
          status: ApplicationStatus.CANCELLED,
        },
      });
    }

    return cancelled;
  }

  async getMyApplications(user: any) {
    const candidateId = user?.candidateProfile?.id;
    if (!candidateId) {
      throw new NotFoundException('Candidate profile not found.');
    }
    return this.prisma.jobApplication.findMany({
      where: { candidateId },
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
        assignedAssessment: {
          select: {
            id: true,
            title: true,
            slug: true,
            type: true,
            timeLimitMinutes: true,
            passingScore: true,
            feedbackVisibility: true,
          },
        },
        statusHistory: {
          orderBy: { createdAt: 'asc' },
        },
        evaluation: true,
      },
      orderBy: [{ createdAt: 'desc' }, { roundNumber: 'desc' }],
    });
  }

  async getApplicationById(user: any, applicationId: string) {
    const application = await this.prisma.jobApplication.findUnique({
      where: { id: applicationId },
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
            skills: { include: { skill: true } },
          },
        },
        candidate: {
          select: {
            id: true,
            userId: true,
            fullName: true,
            headline: true,
            bio: true,
            avatarUrl: true,
            targetCareer: true,
            githubUsername: true,
            education: true,
            experience: true,
            user: {
              select: {
                id: true,
                email: true,
              },
            },
          },
        },
        assignedAssessment: {
          select: {
            id: true,
            title: true,
            slug: true,
            type: true,
            timeLimitMinutes: true,
            passingScore: true,
            feedbackVisibility: true,
          },
        },
        statusHistory: {
          orderBy: { createdAt: 'asc' },
        },
        evaluation: true,
      },
    });

    if (!application) {
      throw new NotFoundException('Application not found.');
    }

    // Strict ownership & role check (Section 16 fix)
    const isOwnerCandidate =
      user.role === UserRole.CANDIDATE &&
      user.candidateProfile?.id === application.candidateId;

    const userCompanyIds = new Set(
      (user.companyMembers || []).map((cm: any) => cm.companyId),
    );
    const isOwningCompany =
      user.role === UserRole.COMPANY &&
      Boolean(application.job.companyId) &&
      userCompanyIds.has(application.job.companyId);

    const isAdmin = user.role === UserRole.ADMIN;

    if (!isOwnerCandidate && !isOwningCompany && !isAdmin) {
      throw new ForbiddenException('You do not have permission to view this application.');
    }

    // Hide internalNote from candidate
    if (isOwnerCandidate) {
      return {
        ...application,
        internalNote: undefined,
      };
    }

    return application;
  }
}
