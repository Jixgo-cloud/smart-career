import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ApplicationStatus,
  AssessmentType,
  FeedbackVisibility,
  JobSource,
  JobType,
  NotificationType,
  QuestionDifficulty,
  QuestionEvaluationMethod,
  VerificationStatus,
} from '@prisma/client';
import * as crypto from 'crypto';
import {
  assessedSkills,
  evaluateFrameworkCoverage,
  readAttemptPercentage,
  validateAssessmentReadiness,
} from '@smartcareer/shared';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { GeminiExtractorService } from '../ingestion/gemini-extractor.service';
import {
  formatStructuredJobText,
  jobSections,
} from '../ingestion/job-detail-content';

@Injectable()
export class CompanyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly extractor: GeminiExtractorService,
  ) {}

  async getCompanyForUser(user: any) {
    const member = (user?.companyMembers || [])[0];
    if (member?.company) {
      return member.company;
    }

    const dbMember = await this.prisma.companyMember.findFirst({
      where: { userId: user.id },
      include: { company: true },
    });

    if (!dbMember?.company) {
      throw new ForbiddenException('User is not associated with any company.');
    }

    return dbMember.company;
  }

  private sanitizeVerificationRecord(v: any, companyView = true) {
    const files = Array.isArray((v.documents as any)?.files)
      ? (v.documents as any).files.map((f: any, index: number) => ({
          index,
          name: f.name,
          type: f.type,
          size: f.size,
          downloadUrl: companyView
            ? `/company/verifications/${v.id}/documents/${index}`
            : `/admin/verifications/${v.id}/documents/${index}`,
        }))
      : [];

    return {
      id: v.id,
      companyId: v.companyId,
      businessRegNo: v.businessRegNo,
      status: v.status,
      reviewedBy: v.reviewedBy,
      reviewedAt: v.reviewedAt,
      rejectionReason: v.rejectionReason,
      createdAt: v.createdAt,
      documents: { files },
    };
  }

  async getProfile(user: any) {
    const baseCompany = await this.getCompanyForUser(user);
    const company = await this.prisma.company.findUnique({
      where: { id: baseCompany.id },
      include: {
        jobs: {
          include: {
            skills: { include: { skill: true } },
            _count: { select: { applications: true } },
            applications: {
              where: { status: ApplicationStatus.ACCEPTED },
              select: { id: true },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
        verifications: {
          orderBy: { createdAt: 'desc' },
        },
        assessments: {
          include: {
            skill: true,
            _count: { select: { questions: true, attempts: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!company) {
      throw new NotFoundException('Company not found.');
    }

    const latestVerification = company.verifications[0] || null;

    return {
      ...company,
      companyName: company.name,
      businessRegistrationNo: latestVerification?.businessRegNo || null,
      verificationRejectionReason: latestVerification?.rejectionReason || null,
      jobs: company.jobs.map(({ applications, ...job }) => ({
        ...job,
        acceptedCount: applications ? applications.length : 0,
      })),
      verifications: company.verifications.map((v) =>
        this.sanitizeVerificationRecord(v, true),
      ),
      assessments: company.assessments.map((exam) => ({
        ...exam,
        gradingMode: 'COMPANY_MANUAL',
      })),
    };
  }

  async updateProfile(user: any, body: Record<string, any>) {
    const company = await this.getCompanyForUser(user);
    const updateData: Record<string, any> = {};

    const rawName = body.name !== undefined ? body.name : body.companyName;
    if (rawName !== undefined) {
      const name = String(rawName || '').trim();
      if (name.length < 2 || name.length > 200) {
        throw new BadRequestException('Company name must be between 2 and 200 characters.');
      }
      updateData.name = name;
    }

    if (body.industry !== undefined) {
      const industry =
        body.industry === null ? null : String(body.industry).trim();
      if (industry && industry.length > 200) {
        throw new BadRequestException('industry must not exceed 200 characters.');
      }
      updateData.industry = industry || null;
    }

    if (body.companySize !== undefined) {
      const companySize =
        body.companySize === null ? null : String(body.companySize).trim();
      if (companySize && companySize.length > 100) {
        throw new BadRequestException('companySize must not exceed 100 characters.');
      }
      updateData.companySize = companySize || null;
    }

    if (body.description !== undefined) {
      const desc = body.description === null ? null : String(body.description).trim();
      if (desc && desc.length > 10000) {
        throw new BadRequestException('description must not exceed 10000 characters.');
      }
      updateData.description = desc;
    }

    if (body.website !== undefined) {
      const website = body.website === null ? null : String(body.website).trim();
      if (website && website.length > 500) {
        throw new BadRequestException('website must not exceed 500 characters.');
      }
      updateData.website = website;
    }

    const rawAddress = body.address !== undefined ? body.address : body.location;
    if (rawAddress !== undefined) {
      const address = rawAddress === null ? null : String(rawAddress).trim();
      if (address && address.length > 1000) {
        throw new BadRequestException('address must not exceed 1000 characters.');
      }
      updateData.address = address;
    }

    if (body.contactEmail !== undefined) {
      const contactEmail =
        body.contactEmail === null ? null : String(body.contactEmail).trim();
      if (contactEmail && contactEmail.length > 320) {
        throw new BadRequestException('contactEmail is too long.');
      }
      updateData.contactEmail = contactEmail;
    }

    if (body.contactPhone !== undefined) {
      const contactPhone =
        body.contactPhone === null ? null : String(body.contactPhone).trim();
      if (contactPhone && contactPhone.length > 50) {
        throw new BadRequestException('contactPhone is too long.');
      }
      updateData.contactPhone = contactPhone;
    }

    if (body.logoUrl !== undefined) {
      const logoUrl =
        body.logoUrl === null || String(body.logoUrl).trim() === ''
          ? null
          : String(body.logoUrl).trim();
      if (logoUrl && logoUrl.length > 2000000) {
        throw new BadRequestException('logoUrl exceeds maximum allowed length.');
      }
      updateData.logoUrl = logoUrl;
    }

    await this.prisma.company.update({
      where: { id: company.id },
      data: updateData,
    });

    const jobSyncData: Record<string, any> = {};
    if (updateData.name !== undefined) {
      jobSyncData.companyName = updateData.name;
    }
    if (updateData.logoUrl !== undefined) {
      jobSyncData.companyLogoUrl = updateData.logoUrl;
    }
    if (Object.keys(jobSyncData).length > 0) {
      await this.prisma.job.updateMany({
        where: { companyId: company.id },
        data: jobSyncData,
      });
    }

    return this.getProfile(user);
  }

  private verifyFileSignature(mimeType: string, buffer: Buffer): boolean {
    if (buffer.length < 4) return false;
    if (mimeType === 'application/pdf') {
      return buffer.slice(0, 4).toString('ascii') === '%PDF';
    }
    if (mimeType === 'image/jpeg') {
      return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
    }
    if (mimeType === 'image/png') {
      return (
        buffer[0] === 0x89 &&
        buffer[1] === 0x50 &&
        buffer[2] === 0x4e &&
        buffer[3] === 0x47
      );
    }
    return false;
  }

  async submitVerification(
    user: any,
    body: {
      businessRegNo: string;
      documents: {
        files: Array<{ name: string; type: string; size: number; dataUrl: string }>;
      };
    },
  ) {
    const company = await this.getCompanyForUser(user);

    const existingPending = await this.prisma.companyVerification.findFirst({
      where: {
        companyId: company.id,
        status: VerificationStatus.PENDING,
      },
    });

    if (existingPending) {
      throw new ConflictException(
        'A verification request is already PENDING for this company.',
      );
    }

    const regNo = String(body?.businessRegNo || '').trim();
    if (!/^\d{13}$/.test(regNo)) {
      throw new BadRequestException('businessRegNo must be a 13-digit number.');
    }

    const files = body?.documents?.files;
    if (!Array.isArray(files) || files.length < 1 || files.length > 5) {
      throw new BadRequestException('Must attach between 1 and 5 verification documents.');
    }

    const allowedTypes = new Set(['application/pdf', 'image/jpeg', 'image/png']);
    let totalDecodedBytes = 0;

    const sanitizedFiles = files.map((file, idx) => {
      const name = String(file?.name || `document-${idx + 1}`).trim();
      const type = String(file?.type || '').trim().toLowerCase();
      const dataUrl = String(file?.dataUrl || '').trim();

      if (!allowedTypes.has(type)) {
        throw new BadRequestException(
          `File "${name}" has unsupported MIME type "${type}". Allowed: PDF, JPEG, PNG.`,
        );
      }

      const prefix = `data:${type};base64,`;
      if (!dataUrl.toLowerCase().startsWith(prefix)) {
        throw new BadRequestException(`File "${name}" dataUrl does not match MIME type.`);
      }

      const base64Data = dataUrl.slice(prefix.length);
      const buffer = Buffer.from(base64Data, 'base64');
      if (buffer.length === 0) {
        throw new BadRequestException(`File "${name}" is empty.`);
      }

      if (!this.verifyFileSignature(type, buffer)) {
        throw new BadRequestException(
          `File "${name}" binary signature does not match ${type}.`,
        );
      }

      totalDecodedBytes += buffer.length;
      if (totalDecodedBytes > 3 * 1024 * 1024) {
        throw new BadRequestException(
          'Total decoded size of verification documents cannot exceed 3 MiB.',
        );
      }

      return {
        name: name.slice(0, 200),
        type,
        size: buffer.length,
        dataUrl,
      };
    });

    const created = await this.prisma.$transaction(async (tx) => {
      const ver = await tx.companyVerification.create({
        data: {
          companyId: company.id,
          businessRegNo: regNo,
          status: VerificationStatus.PENDING,
          documents: { files: sanitizedFiles } as any,
        },
      });

      await tx.company.update({
        where: { id: company.id },
        data: { verificationStatus: VerificationStatus.PENDING },
      });

      return ver;
    });

    return this.sanitizeVerificationRecord(created, true);
  }

  async downloadVerificationDocument(user: any, verificationId: string, indexStr: string) {
    const company = await this.getCompanyForUser(user);
    const verification = await this.prisma.companyVerification.findUnique({
      where: { id: verificationId },
    });

    if (!verification || verification.companyId !== company.id) {
      throw new ForbiddenException('You do not have access to this verification document.');
    }

    const index = Number(indexStr);
    const files: any[] = (verification.documents as any)?.files || [];
    if (!Number.isInteger(index) || index < 0 || index >= files.length) {
      throw new NotFoundException('Verification document not found.');
    }

    const file = files[index];
    const commaIdx = String(file.dataUrl || '').indexOf(',');
    const base64 = commaIdx >= 0 ? file.dataUrl.slice(commaIdx + 1) : '';
    const buffer = Buffer.from(base64, 'base64');

    return {
      name: file.name || `document-${index}`,
      type: file.type || 'application/octet-stream',
      buffer,
    };
  }

  private async validateJobPayload(
    companyId: string,
    body: Record<string, any>,
    isUpdate = false,
  ) {
    const data: Record<string, any> = {};

    if (!isUpdate || body.title !== undefined) {
      const title = String(body.title || '').trim();
      if (title.length < 2 || title.length > 200) {
        throw new BadRequestException('Job title must be between 2 and 200 characters.');
      }
      data.title = title;
    }

    if (!isUpdate || body.description !== undefined) {
      const description = formatStructuredJobText(String(body.description || ''));
      if (description.length < 10 || description.length > 30000) {
        throw new BadRequestException(
          'Job description must be between 10 and 30000 characters.',
        );
      }
      data.description = description;
    }

    const extractedSections = data.description
      ? jobSections(data.description)
      : {};

    if (body.requirements !== undefined) {
      const req =
        body.requirements === null || String(body.requirements).trim() === ''
          ? extractedSections.requirements || null
          : formatStructuredJobText(String(body.requirements));
      if (req && req.length > 30000) {
        throw new BadRequestException('requirements cannot exceed 30000 characters.');
      }
      data.requirements = req;
    } else if (!isUpdate && extractedSections.requirements) {
      data.requirements = extractedSections.requirements;
    }

    if (body.benefits !== undefined) {
      const ben =
        body.benefits === null || String(body.benefits).trim() === ''
          ? extractedSections.benefits || null
          : formatStructuredJobText(String(body.benefits));
      if (ben && ben.length > 30000) {
        throw new BadRequestException('benefits cannot exceed 30000 characters.');
      }
      data.benefits = ben;
    } else if (!isUpdate && extractedSections.benefits) {
      data.benefits = extractedSections.benefits;
    }

    if (body.location !== undefined) {
      const loc = String(body.location || 'Bangkok, Thailand').trim();
      if (loc.length > 200) {
        throw new BadRequestException('location cannot exceed 200 characters.');
      }
      data.location = loc;
    }

    if (body.isRemote !== undefined) {
      data.isRemote = Boolean(body.isRemote);
    }

    if (body.employmentType !== undefined) {
      if (!Object.values(JobType).includes(body.employmentType as JobType)) {
        throw new BadRequestException(`Invalid employmentType "${body.employmentType}".`);
      }
      data.employmentType = body.employmentType as JobType;
    }

    if (body.salaryMin !== undefined) {
      if (body.salaryMin === null || body.salaryMin === '') {
        data.salaryMin = null;
      } else {
        const min = Number(body.salaryMin);
        if (!Number.isInteger(min) || min < 0 || min > 1000000000) {
          throw new BadRequestException('salaryMin must be an integer between 0 and 1000000000.');
        }
        data.salaryMin = min;
      }
    }

    if (body.salaryMax !== undefined) {
      if (body.salaryMax === null || body.salaryMax === '') {
        data.salaryMax = null;
      } else {
        const max = Number(body.salaryMax);
        if (!Number.isInteger(max) || max < 0 || max > 1000000000) {
          throw new BadRequestException('salaryMax must be an integer between 0 and 1000000000.');
        }
        data.salaryMax = max;
      }
    }

    if (
      data.salaryMin !== undefined &&
      data.salaryMax !== undefined &&
      data.salaryMin !== null &&
      data.salaryMax !== null &&
      data.salaryMin > data.salaryMax
    ) {
      throw new BadRequestException('salaryMin cannot be greater than salaryMax.');
    }

    if (body.salaryCurrency !== undefined) {
      const curr = String(body.salaryCurrency || 'THB').trim().toUpperCase();
      if (curr.length !== 3) {
        throw new BadRequestException('salaryCurrency must be a 3-letter currency code.');
      }
      data.salaryCurrency = curr;
    }

    if (body.acceptedQuota !== undefined) {
      if (body.acceptedQuota === null || body.acceptedQuota === '') {
        data.acceptedQuota = null;
      } else {
        const q = Number(body.acceptedQuota);
        if (!Number.isInteger(q) || q < 1 || q > 100000) {
          throw new BadRequestException('acceptedQuota must be an integer between 1 and 100000.');
        }
        data.acceptedQuota = q;
      }
    }

    if (body.customAssessmentId !== undefined) {
      if (!body.customAssessmentId) {
        data.customAssessmentId = null;
      } else {
        const exam = await this.prisma.assessment.findUnique({
          where: { id: String(body.customAssessmentId) },
          include: { questions: { include: { choices: true } } },
        });
        if (!exam || exam.companyId !== companyId || !exam.isActive) {
          throw new BadRequestException(
            'customAssessmentId must belong to your company and be active.',
          );
        }
        const readiness = validateAssessmentReadiness(exam as any);
        if (!readiness.isReady) {
          throw new BadRequestException(
            `Custom assessment is not ready: ${readiness.readinessError}`,
          );
        }
        data.customAssessmentId = exam.id;
      }
    }

    let validatedSkills: Array<{
      skillId: string;
      isRequired: boolean;
      minimumScore: number;
    }> | undefined;

    if (body.skills !== undefined) {
      if (!Array.isArray(body.skills) || body.skills.length > 50) {
        throw new BadRequestException('skills must be an array of at most 50 items.');
      }

      const seenSkillIds = new Set<string>();
      validatedSkills = [];

      for (const s of body.skills) {
        const skillId = String(s?.skillId || '').trim();
        if (!skillId) {
          throw new BadRequestException('Each job skill must have a valid skillId.');
        }
        if (seenSkillIds.has(skillId)) {
          throw new BadRequestException(`Duplicate skillId "${skillId}" in job skills.`);
        }
        seenSkillIds.add(skillId);

        const minScore = s.minimumScore !== undefined ? Number(s.minimumScore) : 50;
        // Section 16 requirement: enforce 1-100 minimumScore range
        if (!Number.isFinite(minScore) || minScore < 1 || minScore > 100) {
          throw new BadRequestException('Job skill minimumScore must be between 1 and 100.');
        }

        validatedSkills.push({
          skillId,
          isRequired: s.isRequired !== undefined ? Boolean(s.isRequired) : true,
          minimumScore: minScore,
        });
      }

      if (validatedSkills.length > 0) {
        const existingSkills = await this.prisma.skill.findMany({
          where: { id: { in: Array.from(seenSkillIds) } },
          select: { id: true },
        });
        if (existingSkills.length !== seenSkillIds.size) {
          throw new BadRequestException('One or more skillIds do not exist.');
        }
      }
    }

    return { data, validatedSkills };
  }

  async createJob(user: any, body: Record<string, any>) {
    const company = await this.getCompanyForUser(user);
    if (company.verificationStatus !== VerificationStatus.VERIFIED) {
      throw new ForbiddenException(
        'Company must be VERIFIED by an administrator before posting jobs.',
      );
    }
    const { data, validatedSkills } = await this.validateJobPayload(company.id, body, false);

    let finalSkills = validatedSkills && validatedSkills.length > 0 ? validatedSkills : [];
    if (finalSkills.length === 0) {
      finalSkills = await this.extractor.extractJobSkills({
        title: data.title,
        description: data.description,
        requirements: data.requirements,
      });
    }
    if (finalSkills.length === 0) {
      throw new BadRequestException(
        'Please specify at least one job skill or include clear skill requirements in the job description.',
      );
    }

    const slug = `${data.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'job'}-${crypto.randomBytes(3).toString('hex')}`;

    return this.prisma.job.create({
      data: {
        ...data,
        companyId: company.id,
        companyName: company.name,
        companyLogoUrl: company.logoUrl,
        slug,
        source: JobSource.INTERNAL,
        isActive: true,
        skills: {
          create: finalSkills.map((s) => ({
            skillId: s.skillId,
            isRequired: s.isRequired,
            minimumScore: s.minimumScore,
            weight: 1.0,
          })),
        },
      } as any,
      include: {
        skills: { include: { skill: true } },
      },
    });
  }

  async updateJob(user: any, jobId: string, body: Record<string, any>) {
    const company = await this.getCompanyForUser(user);
    const job = await this.prisma.job.findUnique({
      where: { id: jobId },
      include: { skills: true },
    });
    if (!job || job.companyId !== company.id) {
      throw new ForbiddenException('You do not own this job posting.');
    }

    const { data, validatedSkills } = await this.validateJobPayload(company.id, body, true);

    let skillsToReplace = validatedSkills;
    if (skillsToReplace !== undefined && skillsToReplace.length === 0) {
      skillsToReplace = await this.extractor.extractJobSkills({
        title: data.title ?? job.title,
        description: data.description ?? job.description,
        requirements: data.requirements !== undefined ? data.requirements : job.requirements,
      });
      if (skillsToReplace.length === 0) {
        throw new BadRequestException(
          'A job posting must retain at least one required or preferred skill.',
        );
      }
    }

    return this.prisma.$transaction(async (tx) => {
      if (skillsToReplace !== undefined) {
        await tx.jobSkill.deleteMany({ where: { jobId: job.id } });
        if (skillsToReplace.length > 0) {
          await tx.jobSkill.createMany({
            data: skillsToReplace.map((s) => ({
              jobId: job.id,
              skillId: s.skillId,
              isRequired: s.isRequired,
              minimumScore: s.minimumScore,
              weight: 1.0,
            })),
          });
        }
      }

      return tx.job.update({
        where: { id: job.id },
        data,
        include: {
          skills: { include: { skill: true } },
        },
      });
    });
  }

  async deleteJob(user: any, jobId: string) {
    const company = await this.getCompanyForUser(user);
    const job = await this.prisma.job.findUnique({
      where: { id: jobId },
      include: { _count: { select: { applications: true } } },
    });

    if (!job || job.companyId !== company.id) {
      throw new ForbiddenException('You do not own this job posting.');
    }

    if (job._count.applications > 0) {
      throw new BadRequestException(
        'Cannot delete a job that already has applications. Please close/deactivate the job instead.',
      );
    }

    await this.prisma.job.delete({ where: { id: job.id } });
    return { deleted: true, id: job.id };
  }

  async toggleJobActive(user: any, jobId: string) {
    const company = await this.getCompanyForUser(user);
    const job = await this.prisma.job.findUnique({ where: { id: jobId } });
    if (!job || job.companyId !== company.id) {
      throw new ForbiddenException('You do not own this job posting.');
    }

    return this.prisma.job.update({
      where: { id: job.id },
      data: { isActive: !job.isActive },
      include: { skills: { include: { skill: true } } },
    });
  }

  async listApplications(
    user: any,
    query: {
      jobId?: string;
      status?: string;
      minCodingScore?: string;
      sortBy?: string;
      sortOrder?: string;
    },
  ) {
    const company = await this.getCompanyForUser(user);

    if (query.jobId) {
      const targetJob = await this.prisma.job.findUnique({ where: { id: query.jobId } });
      if (!targetJob || targetJob.companyId !== company.id) {
        throw new ForbiddenException('You do not have access to applications for this job.');
      }
    }

    const applications = await this.prisma.jobApplication.findMany({
      where: {
        job: { companyId: company.id },
        ...(query.jobId ? { jobId: query.jobId } : {}),
        ...(query.status ? { status: query.status as ApplicationStatus } : {}),
      },
      include: {
        job: {
          include: {
            skills: { include: { skill: true } },
            customAssessment: true,
          },
        },
        candidate: {
          include: {
            user: { select: { id: true, email: true } },
            githubRepos: {
              orderBy: { stargazersCount: 'desc' },
              take: 5,
              select: {
                id: true,
                repoName: true,
                fullName: true,
                url: true,
                language: true,
                stargazersCount: true,
                topics: true,
              },
            },
            skills: {
              where: {
                evidences: { some: {} },
              },
              include: {
                skill: { select: { id: true, name: true, slug: true, category: true } },
                _count: { select: { evidences: true } },
              },
            },
            assessmentAttempts: {
              include: {
                assessment: { include: { skill: true } },
              },
              orderBy: [{ completedAt: 'desc' }, { startedAt: 'desc' }],
            },
          },
        },
        assignedAssessment: true,
        statusHistory: { orderBy: { createdAt: 'asc' } },
        evaluation: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    const enriched = applications.map((app) => {
      const targetExamId =
        app.assignedAssessment?.type === AssessmentType.PRACTICAL_CODING
          ? app.assignedAssessmentId
          : app.job.customAssessment?.type === AssessmentType.PRACTICAL_CODING
            ? app.job.customAssessmentId
            : null;

      const candidateAttempts = app.candidate.assessmentAttempts || [];
      let codingResult: any = null;

      for (const att of candidateAttempts) {
        if (att.assessment?.type !== AssessmentType.PRACTICAL_CODING) continue;
        // Must be either platform coding or owned by this company
        if (att.assessment.companyId && att.assessment.companyId !== company.id) {
          continue;
        }
        if (targetExamId && att.assessmentId !== targetExamId) {
          continue;
        }
        const pct = readAttemptPercentage(att as any);
        if (pct === null) continue;

        codingResult = {
          attemptId: att.id,
          assessmentId: att.assessmentId,
          title: att.assessment.title,
          percentage: pct,
          passed: att.passed,
          reviewStatus: att.reviewStatus,
          completedAt: att.completedAt || att.startedAt,
        };
        break;
      }

      const githubSkills = (app.candidate.skills || [])
        .filter((cs: any) => cs.skill && (cs._count?.evidences || 0) > 0)
        .map((cs: any) => ({
          skillId: cs.skill.id,
          name: cs.skill.name,
          slug: cs.skill.slug,
          category: cs.skill.category,
          repoCount: cs._count?.evidences || 1,
        }));

      const {
        assessmentAttempts: _omit,
        skills: _omitSkills,
        ...candidateSummary
      } = app.candidate;
      return {
        ...app,
        candidate: {
          ...candidateSummary,
          githubSkills,
        },
        codingResult,
      };
    });

    let filtered = enriched;
    if (query.minCodingScore !== undefined && query.minCodingScore !== '') {
      if (query.minCodingScore.toUpperCase() === 'NONE') {
        filtered = enriched.filter((item) => item.codingResult === null);
      } else {
        const min = Number(query.minCodingScore);
        if (Number.isFinite(min)) {
          filtered = enriched.filter(
            (item) =>
              item.codingResult !== null && item.codingResult.percentage >= min,
          );
        }
      }
    }

    if (query.sortBy === 'codingScore') {
      const asc = (query.sortOrder || '').toUpperCase() === 'ASC';
      filtered.sort((a, b) => {
        const scoreA = a.codingResult?.percentage ?? null;
        const scoreB = b.codingResult?.percentage ?? null;
        if (scoreA === null && scoreB === null) return 0;
        if (scoreA === null) return 1; // Always place null at the end
        if (scoreB === null) return -1;
        return asc ? scoreA - scoreB : scoreB - scoreA;
      });
    }

    return filtered;
  }

  async exportApplicationsCsv(user: any, jobId?: string): Promise<string> {
    const list = await this.listApplications(user, { jobId });
    const header = [
      'Application ID',
      'Job Title',
      'Candidate Name',
      'Email',
      'Status',
      'Round',
      'Match Score At Application',
      'Coding Score (%)',
      'Applied At',
    ];

    const escapeCsv = (val: any) => {
      if (val === null || val === undefined) return '';
      const str = String(val).replace(/"/g, '""');
      return /[",\n\r]/.test(str) ? `"${str}"` : str;
    };

    const rows = list.map((item) => [
      escapeCsv(item.id),
      escapeCsv(item.job?.title),
      escapeCsv(item.candidate?.fullName),
      escapeCsv(item.candidate?.user?.email),
      escapeCsv(item.status),
      escapeCsv(item.roundNumber),
      escapeCsv(item.matchScoreAtApplication ?? 'Unassessed'),
      escapeCsv(item.codingResult?.percentage ?? 'None'),
      escapeCsv(item.createdAt ? new Date(item.createdAt).toISOString() : ''),
    ]);

    return '\uFEFF' + [header.join(','), ...rows.map((r) => r.join(','))].join('\n');
  }

  async updateApplicationStatus(
    user: any,
    applicationId: string,
    body: {
      status: ApplicationStatus;
      note?: string;
      internalNote?: string;
      assessmentId?: string;
    },
  ) {
    const company = await this.getCompanyForUser(user);

    const application = await this.prisma.jobApplication.findUnique({
      where: { id: applicationId },
      include: {
        job: true,
        candidate: true,
      },
    });

    if (!application || application.job.companyId !== company.id) {
      throw new ForbiddenException('You do not have permission to update this application.');
    }

    if (application.status === ApplicationStatus.CANCELLED) {
      throw new BadRequestException('Cannot change the status of a CANCELLED application.');
    }

    const newStatus = body?.status;
    if (!newStatus || !Object.values(ApplicationStatus).includes(newStatus)) {
      throw new BadRequestException(`Invalid application status "${newStatus}".`);
    }

    let validatedAssessmentId: string | undefined;
    if (body.assessmentId) {
      const exam = await this.prisma.assessment.findUnique({
        where: { id: String(body.assessmentId) },
        include: { questions: { include: { choices: true } } },
      });

      if (
        !exam ||
        !exam.isActive ||
        (exam.companyId !== null && exam.companyId !== company.id)
      ) {
        throw new BadRequestException(
          'Assigned assessment must belong to your company (or platform) and be active.',
        );
      }

      const readiness = validateAssessmentReadiness(exam as any);
      if (!readiness.isReady) {
        throw new BadRequestException(
          `Assigned assessment is not ready: ${readiness.readinessError}`,
        );
      }

      validatedAssessmentId = exam.id;
    }

    // Transactionally update status, history, and check acceptedQuota
    const updated = await this.prisma.$transaction(async (tx) => {
      const app = await tx.jobApplication.update({
        where: { id: application.id },
        data: {
          status: newStatus,
          ...(validatedAssessmentId ? { assignedAssessmentId: validatedAssessmentId } : {}),
          ...(body.internalNote !== undefined
            ? { internalNote: body.internalNote ? String(body.internalNote).trim() : null }
            : {}),
        },
        include: {
          job: true,
          assignedAssessment: true,
          statusHistory: { orderBy: { createdAt: 'asc' } },
        },
      });

      await tx.applicationStatusHistory.create({
        data: {
          applicationId: application.id,
          previousStatus: application.status,
          newStatus,
          changedById: user.id,
          note: body.note ? String(body.note).trim() : null,
        },
      });

      if (
        newStatus === ApplicationStatus.ACCEPTED &&
        application.job.acceptedQuota &&
        application.job.acceptedQuota > 0
      ) {
        const acceptedCount = await tx.jobApplication.count({
          where: {
            jobId: application.jobId,
            status: ApplicationStatus.ACCEPTED,
          },
        });

        if (acceptedCount >= application.job.acceptedQuota) {
          await tx.job.update({
            where: { id: application.jobId },
            data: { isActive: false },
          });
        }
      }

      return tx.jobApplication.findUnique({
        where: { id: app.id },
        include: {
          job: true,
          assignedAssessment: true,
          statusHistory: { orderBy: { createdAt: 'asc' } },
        },
      });
    });

    if (application.candidate?.userId) {
      let notifType: NotificationType = NotificationType.APPLICATION_STATUS_CHANGED;
      if (newStatus === ApplicationStatus.INTERVIEW) {
        notifType = NotificationType.INTERVIEW_INVITATION;
      } else if (newStatus === ApplicationStatus.TECHNICAL_TEST || validatedAssessmentId) {
        notifType = NotificationType.ASSESSMENT_ASSIGNED;
      } else if (newStatus === ApplicationStatus.OFFER) {
        notifType = NotificationType.OFFER_RECEIVED;
      }

      await this.notifications.createNotification({
        userId: application.candidate.userId,
        type: notifType,
        title: `อัปเดตสถานะใบสมัคร: ${newStatus}`,
        message: `ใบสมัครงานตำแหน่ง "${application.job.title}" เปลี่ยนสถานะเป็น ${newStatus}`,
        link: `/applications`,
        metadata: {
          applicationId: application.id,
          jobId: application.jobId,
          status: newStatus,
          assignedAssessmentId: validatedAssessmentId ?? null,
        },
      });
    }

    return updated;
  }

  async assignAssessmentToApplication(
    user: any,
    applicationId: string,
    body: { assessmentId: string; note?: string },
  ) {
    if (!body?.assessmentId) {
      throw new BadRequestException('assessmentId is required.');
    }
    return this.updateApplicationStatus(user, applicationId, {
      status: ApplicationStatus.TECHNICAL_TEST,
      assessmentId: body.assessmentId,
      note: body.note || 'Assigned technical assessment',
    });
  }

  async getCandidateScreeningProfile(
    user: any,
    candidateId: string,
    applicationId?: string,
  ) {
    const company = await this.getCompanyForUser(user);

    const application = await this.prisma.jobApplication.findFirst({
      where: {
        candidateId,
        job: { companyId: company.id },
        ...(applicationId ? { id: applicationId } : {}),
      },
      include: {
        job: {
          include: { skills: { include: { skill: true } } },
        },
        statusHistory: { orderBy: { createdAt: 'asc' } },
        evaluation: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!application) {
      throw new ForbiddenException(
        'You can only view profiles of candidates who have applied to your company.',
      );
    }

    const candidate = await this.prisma.candidateProfile.findUnique({
      where: { id: candidateId },
      include: {
        user: { select: { id: true, email: true } },
        githubRepos: { orderBy: { stargazersCount: 'desc' } },
        assessmentAttempts: {
          where: {
            OR: [
              { assessment: { companyId: null } },
              { assessment: { companyId: company.id } },
            ],
          },
          include: {
            assessment: { include: { skill: true } },
          },
          orderBy: [{ completedAt: 'desc' }, { startedAt: 'desc' }],
        },
      },
    });

    if (!candidate) {
      throw new NotFoundException('Candidate not found.');
    }

    const assessedMap = assessedSkills(candidate.assessmentAttempts as any);

    return {
      candidate: {
        id: candidate.id,
        fullName: candidate.fullName,
        headline: candidate.headline,
        bio: candidate.bio,
        avatarUrl: candidate.avatarUrl,
        targetCareer: candidate.targetCareer,
        githubUsername: candidate.githubUsername,
        education: candidate.education,
        experience: candidate.experience,
        email: candidate.user?.email,
        githubRepos: candidate.githubRepos,
        assessedSkills: Array.from(assessedMap.values()),
      },
      application,
      companyAttempts: candidate.assessmentAttempts.filter(
        (a) => a.assessment?.companyId === company.id,
      ),
    };
  }

  // Company Custom Assessments Management
  async listCompanyAssessments(user: any) {
    const company = await this.getCompanyForUser(user);
    const exams = await this.prisma.assessment.findMany({
      where: { companyId: company.id },
      include: {
        skill: true,
        questions: {
          include: { choices: true },
          orderBy: { createdAt: 'asc' },
        },
        _count: { select: { attempts: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return exams.map((exam) => {
      const readiness = validateAssessmentReadiness(exam as any);
      return {
        ...exam,
        gradingMode: 'COMPANY_MANUAL',
        isReady: readiness.isReady,
        readinessError: readiness.readinessError,
        frameworkCoverage: readiness.frameworkCoverage,
      };
    });
  }

  async getCompanyAssessmentById(user: any, assessmentId: string) {
    const company = await this.getCompanyForUser(user);
    const exam = await this.prisma.assessment.findUnique({
      where: { id: assessmentId },
      include: {
        skill: true,
        questions: {
          include: { choices: true },
          orderBy: { createdAt: 'asc' },
        },
        _count: { select: { attempts: true } },
      },
    });

    if (!exam || exam.companyId !== company.id) {
      throw new ForbiddenException('You do not own this assessment.');
    }

    const readiness = validateAssessmentReadiness(exam as any);
    return {
      ...exam,
      gradingMode: 'COMPANY_MANUAL',
      isReady: readiness.isReady,
      readinessError: readiness.readinessError,
      frameworkCoverage: readiness.frameworkCoverage,
    };
  }

  async createCompanyAssessment(user: any, body: Record<string, any>) {
    const company = await this.getCompanyForUser(user);

    const type = (body.type || AssessmentType.PRACTICAL_CODING) as AssessmentType;
    const questionsInput: any[] = Array.isArray(body.questions)
      ? body.questions.map((q, idx) => ({
          ...q,
          title:
            q?.title && String(q.title).trim()
              ? String(q.title).trim()
              : `${String(body.title || 'Company Question').trim()} - Q${idx + 1}`,
        }))
      : [];

    // Enforce company coding questions to be OPEN_ENDED (Section 7.5 & 18.5)
    if (type === AssessmentType.PRACTICAL_CODING) {
      for (const q of questionsInput) {
        if (q.evaluationMethod && q.evaluationMethod !== 'OPEN_ENDED') {
          throw new BadRequestException(
            'New company coding assessments must use evaluationMethod = OPEN_ENDED for human review.',
          );
        }
        q.evaluationMethod = 'OPEN_ENDED';
      }
    }

    const payloadToValidate = {
      companyId: company.id,
      title: body.title,
      type,
      skillId: body.skillId || null,
      timeLimitMinutes: Number(body.timeLimitMinutes ?? body.timeLimitMins ?? 45),
      passingScore: Number(body.passingScore ?? 70),
      feedbackVisibility: body.feedbackVisibility || FeedbackVisibility.AFTER_REVIEW,
      frameworkCode: body.frameworkCode || null,
      frameworkVersion: body.frameworkVersion || null,
      frameworkScope: body.frameworkScope || null,
      questions: questionsInput,
    };

    const readiness = validateAssessmentReadiness(payloadToValidate);
    if (!readiness.isReady) {
      throw new BadRequestException(readiness.readinessError || 'Invalid assessment payload.');
    }

    const slug = `${String(body.title)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'company-exam'}-${crypto.randomBytes(3).toString('hex')}`;

    const created = await this.prisma.assessment.create({
      data: {
        companyId: company.id,
        title: String(body.title).trim(),
        slug,
        description: body.description ? String(body.description).trim() : null,
        type,
        skillId: body.skillId || null,
        timeLimitMinutes: payloadToValidate.timeLimitMinutes,
        passingScore: payloadToValidate.passingScore,
        feedbackVisibility: payloadToValidate.feedbackVisibility as FeedbackVisibility,
        frameworkCode: payloadToValidate.frameworkCode,
        frameworkVersion: payloadToValidate.frameworkVersion,
        frameworkScope: payloadToValidate.frameworkScope,
        isActive: body.isActive !== undefined ? Boolean(body.isActive) : true,
        questions: {
          create: questionsInput.map((q) => ({
            title: String(q.title).trim(),
            prompt: String(q.prompt).trim(),
            difficulty: (q.difficulty || QuestionDifficulty.MEDIUM) as QuestionDifficulty,
            points: Number(q.points || 100),
            starterCode: q.starterCode ?? null,
            evaluationMethod: (type === AssessmentType.PRACTICAL_CODING
              ? QuestionEvaluationMethod.OPEN_ENDED
              : QuestionEvaluationMethod.AUTOMATED_TEST_CASES) as QuestionEvaluationMethod,
            rubric: q.rubric ?? null,
            frameworkTopicId: q.frameworkTopicId ?? null,
            frameworkMappingNote: q.frameworkMappingNote ?? null,
            choices:
              type === AssessmentType.THEORY && Array.isArray(q.choices)
                ? {
                    create: q.choices.map((c: any, idx: number) => ({
                      text: String(c.text).trim(),
                      isCorrect: Boolean(c.isCorrect),
                      order: c.order ?? idx + 1,
                    })),
                  }
                : undefined,
          })),
        },
      },
      include: {
        skill: true,
        questions: { include: { choices: true } },
      },
    });

    return {
      ...created,
      gradingMode: 'COMPANY_MANUAL',
      isReady: readiness.isReady,
      readinessError: readiness.readinessError,
      frameworkCoverage: readiness.frameworkCoverage,
    };
  }

  async updateCompanyAssessment(
    user: any,
    assessmentId: string,
    body: Record<string, any>,
  ) {
    const company = await this.getCompanyForUser(user);
    const existing = await this.prisma.assessment.findUnique({
      where: { id: assessmentId },
      include: {
        questions: { include: { choices: true } },
        _count: { select: { attempts: true } },
      },
    });

    if (!existing || existing.companyId !== company.id) {
      throw new ForbiddenException('You do not own this assessment.');
    }

    // Section 19.4: Reject modifying scoring criteria if attempts already exist
    if (existing._count.attempts > 0) {
      const scoringChanged =
        (body.type !== undefined && body.type !== existing.type) ||
        (body.timeLimitMinutes !== undefined &&
          Number(body.timeLimitMinutes) !== existing.timeLimitMinutes) ||
        (body.passingScore !== undefined &&
          Number(body.passingScore) !== existing.passingScore) ||
        body.questions !== undefined;

      if (scoringChanged) {
        throw new BadRequestException(
          'Cannot modify questions or scoring criteria of an assessment that already has candidate attempts. Please create a new assessment.',
        );
      }

      return this.prisma.assessment.update({
        where: { id: existing.id },
        data: {
          title: body.title ? String(body.title).trim() : existing.title,
          description:
            body.description !== undefined ? body.description : existing.description,
          feedbackVisibility:
            (body.feedbackVisibility as FeedbackVisibility) || existing.feedbackVisibility,
          version: { increment: 1 },
        },
        include: { questions: { include: { choices: true } } },
      });
    }

    const type = (body.type || existing.type) as AssessmentType;
    const questionsInput: any[] = Array.isArray(body.questions)
      ? body.questions
      : existing.questions;

    if (type === AssessmentType.PRACTICAL_CODING && Array.isArray(body.questions)) {
      for (const q of questionsInput) {
        q.evaluationMethod = 'OPEN_ENDED';
      }
    }

    const payloadToValidate = {
      companyId: company.id,
      title: body.title ?? existing.title,
      type,
      skillId: body.skillId !== undefined ? body.skillId : existing.skillId,
      timeLimitMinutes: Number(body.timeLimitMinutes ?? existing.timeLimitMinutes),
      passingScore: Number(body.passingScore ?? existing.passingScore),
      feedbackVisibility: body.feedbackVisibility || existing.feedbackVisibility,
      frameworkCode:
        body.frameworkCode !== undefined ? body.frameworkCode : existing.frameworkCode,
      frameworkVersion:
        body.frameworkVersion !== undefined
          ? body.frameworkVersion
          : existing.frameworkVersion,
      frameworkScope:
        body.frameworkScope !== undefined ? body.frameworkScope : existing.frameworkScope,
      questions: questionsInput,
    };

    const readiness = validateAssessmentReadiness(payloadToValidate);
    if (!readiness.isReady) {
      throw new BadRequestException(readiness.readinessError || 'Invalid assessment update.');
    }

    return this.prisma.$transaction(async (tx) => {
      if (Array.isArray(body.questions)) {
        await tx.question.deleteMany({ where: { assessmentId: existing.id } });
      }

      return tx.assessment.update({
        where: { id: existing.id },
        data: {
          title: String(payloadToValidate.title).trim(),
          description:
            body.description !== undefined ? body.description : existing.description,
          type,
          skillId: payloadToValidate.skillId,
          timeLimitMinutes: payloadToValidate.timeLimitMinutes,
          passingScore: payloadToValidate.passingScore,
          feedbackVisibility: payloadToValidate.feedbackVisibility as FeedbackVisibility,
          frameworkCode: payloadToValidate.frameworkCode,
          frameworkVersion: payloadToValidate.frameworkVersion,
          frameworkScope: payloadToValidate.frameworkScope,
          version: { increment: 1 },
          ...(Array.isArray(body.questions)
            ? {
                questions: {
                  create: questionsInput.map((q) => ({
                    title: String(q.title).trim(),
                    prompt: String(q.prompt).trim(),
                    difficulty: (q.difficulty ||
                      QuestionDifficulty.MEDIUM) as QuestionDifficulty,
                    points: Number(q.points || 100),
                    starterCode: q.starterCode ?? null,
                    evaluationMethod: QuestionEvaluationMethod.OPEN_ENDED,
                    rubric: q.rubric ?? null,
                    frameworkTopicId: q.frameworkTopicId ?? null,
                    frameworkMappingNote: q.frameworkMappingNote ?? null,
                    choices:
                      type === AssessmentType.THEORY && Array.isArray(q.choices)
                        ? {
                            create: q.choices.map((c: any, idx: number) => ({
                              text: String(c.text).trim(),
                              isCorrect: Boolean(c.isCorrect),
                              order: c.order ?? idx + 1,
                            })),
                          }
                        : undefined,
                  })),
                },
              }
            : {}),
        },
        include: {
          skill: true,
          questions: { include: { choices: true } },
        },
      });
    });
  }

  async deleteCompanyAssessment(user: any, assessmentId: string) {
    const company = await this.getCompanyForUser(user);
    const exam = await this.prisma.assessment.findUnique({
      where: { id: assessmentId },
      include: { _count: { select: { attempts: true } } },
    });

    if (!exam || exam.companyId !== company.id) {
      throw new ForbiddenException('You do not own this assessment.');
    }

    if (exam._count.attempts > 0) {
      throw new BadRequestException(
        'Cannot delete an assessment that already has candidate attempts. Deactivate it instead.',
      );
    }

    await this.prisma.assessment.delete({ where: { id: exam.id } });
    return { deleted: true, id: exam.id };
  }

  async toggleCompanyAssessment(user: any, assessmentId: string) {
    const company = await this.getCompanyForUser(user);
    const exam = await this.prisma.assessment.findUnique({
      where: { id: assessmentId },
      include: { questions: { include: { choices: true } } },
    });

    if (!exam || exam.companyId !== company.id) {
      throw new ForbiddenException('You do not own this assessment.');
    }

    if (!exam.isActive) {
      const readiness = validateAssessmentReadiness(exam as any);
      if (!readiness.isReady) {
        throw new BadRequestException(
          `Cannot activate assessment: ${readiness.readinessError}`,
        );
      }
    }

    return this.prisma.assessment.update({
      where: { id: exam.id },
      data: { isActive: !exam.isActive },
    });
  }

  async listCompanyAssessmentAttempts(user: any, assessmentId?: string) {
    const company = await this.getCompanyForUser(user);

    if (assessmentId) {
      const exam = await this.prisma.assessment.findUnique({
        where: { id: assessmentId },
      });
      if (!exam || exam.companyId !== company.id) {
        throw new ForbiddenException('You do not own this assessment.');
      }
    }

    const attempts = await this.prisma.assessmentAttempt.findMany({
      where: {
        assessment: {
          companyId: company.id,
          ...(assessmentId ? { id: assessmentId } : {}),
        },
      },
      include: {
        assessment: {
          select: {
            id: true,
            title: true,
            type: true,
            passingScore: true,
            feedbackVisibility: true,
          },
        },
        candidate: {
          select: {
            id: true,
            fullName: true,
            headline: true,
            user: { select: { email: true } },
          },
        },
        answers: true,
      },
      orderBy: [{ startedAt: 'desc' }],
    });

    return attempts.map((att) => {
      const effectivePercentage = readAttemptPercentage(att as any);
      return {
        ...att,
        effectivePercentage,
        score: effectivePercentage,
        gradingStatus: att.reviewStatus,
        user: {
          name: att.candidate?.fullName,
          email: att.candidate?.user?.email,
        },
        codeSubmissions: (att.answers || [])
          .filter((ans) => Boolean(ans.submittedCode))
          .map((ans) => ({
            id: ans.id,
            questionId: ans.questionId,
            sourceCode: ans.submittedCode,
            executionResult: ans.executionResult || null,
          })),
      };
    });
  }
}
