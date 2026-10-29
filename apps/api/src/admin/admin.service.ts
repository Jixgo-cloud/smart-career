import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ApplicationStatus,
  AssessmentType,
  FeedbackVisibility,
  JobSource,
  NotificationType,
  QuestionDifficulty,
  QuestionEvaluationMethod,
  SkillCategory,
  UserRole,
  VerificationStatus,
} from '@prisma/client';
import * as crypto from 'crypto';
import {
  AZ_204_FRAMEWORK,
  readAttemptPercentage,
  validateAssessmentReadiness,
} from '@smartcareer/shared';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AdminAuditService } from './admin-audit.service';

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly audit: AdminAuditService,
  ) {}

  async getDashboard() {
    const [
      totalUsers,
      totalCandidates,
      totalCompanies,
      totalJobs,
      activeJobs,
      totalApplications,
      totalSkills,
      totalAssessments,
      totalAttempts,
      totalCourses,
      pendingVerifications,
      recentIngestionLogs,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.candidateProfile.count(),
      this.prisma.company.count(),
      this.prisma.job.count(),
      this.prisma.job.count({
        where: {
          isActive: true,
          skills: { some: {} },
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
      }),
      this.prisma.jobApplication.count(),
      this.prisma.skill.count(),
      this.prisma.assessment.count(),
      this.prisma.assessmentAttempt.count(),
      this.prisma.course.count(),
      this.prisma.companyVerification.count({
        where: { status: VerificationStatus.PENDING },
      }),
      this.prisma.ingestionLog.findMany({
        orderBy: { startedAt: 'desc' },
        take: 10,
      }),
    ]);

    return {
      users: totalUsers,
      totalUsers,
      candidates: totalCandidates,
      companies: totalCompanies,
      jobs: totalJobs,
      activeJobs,
      applications: totalApplications,
      skills: totalSkills,
      totalSkills,
      assessments: totalAssessments,
      totalAssessments,
      attempts: totalAttempts,
      totalAttempts,
      courses: totalCourses,
      pendingVerifications,
      recentIngestionLogs,
    };
  }

  async listUsers(
    searchOrQuery?:
      | string
      | {
          search?: string;
          role?: string;
          status?: string;
          page?: string | number;
          pageSize?: string | number;
          paginated?: string;
        },
  ) {
    const query =
      typeof searchOrQuery === 'string'
        ? { search: searchOrQuery }
        : searchOrQuery || {};

    const users = await this.prisma.user.findMany({
      include: {
        candidateProfile: {
          select: {
            id: true,
            fullName: true,
            targetCareer: true,
            githubUsername: true,
          },
        },
        companyMembers: {
          include: {
            company: {
              select: {
                id: true,
                name: true,
                slug: true,
                verificationStatus: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const mapped = users.map((u) => {
      const displayName =
        u.candidateProfile?.fullName ||
        u.companyMembers[0]?.company?.name ||
        u.email.split('@')[0];
      return {
        id: u.id,
        email: u.email,
        name: displayName,
        role: u.role,
        authProvider: u.authProvider,
        isActive: u.isActive,
        createdAt: u.createdAt,
        candidateProfile: u.candidateProfile,
        company: u.companyMembers[0]?.company || null,
      };
    });

    const counts = {
      ALL: mapped.length,
      CANDIDATE: mapped.filter((u) => u.role === 'CANDIDATE').length,
      COMPANY: mapped.filter((u) => u.role === 'COMPANY').length,
      ADMIN: mapped.filter((u) => u.role === 'ADMIN').length,
      ACTIVE: mapped.filter((u) => u.isActive).length,
      INACTIVE: mapped.filter((u) => !u.isActive).length,
    };

    const q = (query.search || '').trim().toLowerCase();
    const roleFilter = (query.role || '').trim().toUpperCase();
    const statusFilter = (query.status || '').trim().toUpperCase();

    const filtered = mapped.filter((u) => {
      if (
        roleFilter &&
        roleFilter !== 'ALL' &&
        Object.values(UserRole).includes(roleFilter as UserRole) &&
        u.role !== roleFilter
      ) {
        return false;
      }
      if (statusFilter === 'ACTIVE' && !u.isActive) return false;
      if (statusFilter === 'INACTIVE' && u.isActive) return false;
      if (!q) return true;
      return (
        u.email.toLowerCase().includes(q) ||
        Boolean(u.name && u.name.toLowerCase().includes(q)) ||
        Boolean(
          u.candidateProfile?.githubUsername &&
            u.candidateProfile.githubUsername.toLowerCase().includes(q),
        )
      );
    });

    if (query.paginated === 'true') {
      const rawPage = Number(query.page ?? 1);
      const rawPageSize = Number(query.pageSize ?? 20);
      const page = Number.isFinite(rawPage) ? Math.max(1, Math.floor(rawPage)) : 1;
      const pageSize = Number.isFinite(rawPageSize)
        ? Math.max(1, Math.min(100, Math.floor(rawPageSize)))
        : 20;
      const total = filtered.length;
      const items = filtered.slice((page - 1) * pageSize, page * pageSize);
      return {
        items,
        total,
        counts,
        page,
        pageSize,
        pageCount: Math.max(1, Math.ceil(total / pageSize)),
      };
    }

    return filtered;
  }

  async updateUserStatus(
    adminUser: any,
    userId: string,
    body: { isActive?: boolean },
  ) {
    if (body.isActive !== undefined && typeof body.isActive !== 'boolean') {
      throw new BadRequestException('isActive must be a boolean value.');
    }

    const target = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!target) {
      throw new NotFoundException('User not found.');
    }
    if (target.role === 'ADMIN' || target.id === adminUser?.id) {
      throw new BadRequestException('Cannot deactivate an administrator account.');
    }

    const nextActive =
      body.isActive !== undefined ? body.isActive : !target.isActive;

    const updated = await this.prisma.user.update({
      where: { id: target.id },
      data: {
        isActive: nextActive,
      },
    });

    await this.audit.log(
      adminUser?.id,
      nextActive ? 'USER_ACTIVATE' : 'USER_DEACTIVATE',
      'USER',
      updated.id,
      {
        email: updated.email,
        role: updated.role,
        isActive: updated.isActive,
      },
    );

    return {
      id: updated.id,
      email: updated.email,
      role: updated.role,
      isActive: updated.isActive,
    };
  }

  async listSkills() {
    return this.prisma.skill.findMany({
      include: {
        _count: {
          select: {
            jobSkills: true,
            courseSkills: true,
            assessments: true,
            candidateSkills: true,
          },
        },
      },
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
    });
  }

  async createSkill(
    body: {
      name: string;
      category?: SkillCategory;
      description?: string;
      icon?: string;
    },
    adminUser?: any,
  ) {
    const name = String(body?.name || '').trim();
    if (!name || name.length > 100) {
      throw new BadRequestException('Skill name is required (1-100 characters).');
    }

    const category = (body?.category || SkillCategory.BACKEND) as SkillCategory;
    if (!Object.values(SkillCategory).includes(category)) {
      throw new BadRequestException(`Invalid skill category "${category}".`);
    }

    const existingByName = await this.prisma.skill.findFirst({
      where: {
        name: { equals: name, mode: 'insensitive' },
      },
    });

    if (existingByName) {
      throw new ConflictException(`Skill "${name}" already exists.`);
    }

    const baseSlug =
      name
        .toLowerCase()
        .replace(/\+/g, '-plus-')
        .replace(/#/g, '-sharp-')
        .replace(/\./g, '-dot-')
        .replace(/&/g, '-and-')
        .replace(/[^a-z0-9ก-๙]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '') ||
      `skill-${crypto.randomBytes(3).toString('hex')}`;

    let slug = baseSlug;
    let suffix = 2;
    while (
      await this.prisma.skill.findFirst({
        where: { slug: { equals: slug, mode: 'insensitive' } },
        select: { id: true },
      })
    ) {
      slug =
        suffix <= 20
          ? `${baseSlug}-${suffix}`
          : `${baseSlug}-${crypto.randomBytes(2).toString('hex')}`;
      suffix += 1;
    }

    const created = await this.prisma.skill.create({
      data: {
        name,
        slug,
        category,
        description: body.description ? String(body.description).trim() : null,
        icon: body.icon ? String(body.icon).trim() : null,
      },
    });

    await this.audit.log(adminUser?.id, 'SKILL_CREATE', 'SKILL', created.id, {
      name: created.name,
      slug: created.slug,
      category: created.category,
    });

    return created;
  }

  async deleteSkill(skillId: string, adminUser?: any) {
    const skill = await this.prisma.skill.findUnique({
      where: { id: skillId },
      include: {
        _count: {
          select: {
            jobSkills: true,
            courseSkills: true,
            assessments: true,
            candidateSkills: true,
          },
        },
      },
    });

    if (!skill) {
      throw new NotFoundException('Skill not found.');
    }

    const totalRefs =
      skill._count.jobSkills +
      skill._count.courseSkills +
      skill._count.assessments +
      skill._count.candidateSkills;

    if (totalRefs > 0) {
      throw new BadRequestException(
        `Cannot delete skill "${skill.name}" because it is referenced by ${totalRefs} records.`,
      );
    }

    await this.prisma.skill.delete({ where: { id: skill.id } });

    await this.audit.log(adminUser?.id, 'SKILL_DELETE', 'SKILL', skill.id, {
      name: skill.name,
      slug: skill.slug,
    });

    return { deleted: true, id: skill.id };
  }

  async listFrameworks() {
    const frameworks = await this.prisma.skillFramework.findMany({
      include: {
        items: { include: { skill: true } },
      },
      orderBy: { code: 'asc' },
    });

    return {
      frameworks,
      catalog: [AZ_204_FRAMEWORK],
    };
  }

  async listIngestionLogs() {
    return this.prisma.ingestionLog.findMany({
      orderBy: { startedAt: 'desc' },
      take: 100,
    });
  }

  async listAdminJobs(query: {
    search?: string;
    source?: string;
    status?: string;
    page?: string | number;
    pageSize?: string | number;
  }) {
    const rawPage = Number(query?.page ?? 1);
    const rawPageSize = Number(query?.pageSize ?? 20);
    const page = Number.isFinite(rawPage) ? Math.max(1, Math.floor(rawPage)) : 1;
    const pageSize = Number.isFinite(rawPageSize)
      ? Math.max(1, Math.min(100, Math.floor(rawPageSize)))
      : 20;

    const where: any = {};
    if (
      query?.source &&
      query.source !== 'ALL' &&
      Object.values(JobSource).includes(query.source as JobSource)
    ) {
      where.source = query.source as JobSource;
    }
    if (query?.status === 'ACTIVE') {
      where.isActive = true;
    } else if (query?.status === 'INACTIVE') {
      where.isActive = false;
    }
    if (query?.search && String(query.search).trim()) {
      const q = String(query.search).trim();
      where.OR = [
        { title: { contains: q, mode: 'insensitive' } },
        { companyName: { contains: q, mode: 'insensitive' } },
        { location: { contains: q, mode: 'insensitive' } },
      ];
    }

    const [total, items] = await Promise.all([
      this.prisma.job.count({ where }),
      this.prisma.job.findMany({
        where,
        select: {
          id: true,
          title: true,
          slug: true,
          companyId: true,
          companyName: true,
          location: true,
          isRemote: true,
          employmentType: true,
          salaryMin: true,
          salaryMax: true,
          salaryCurrency: true,
          source: true,
          sourceUrl: true,
          isActive: true,
          publishedAt: true,
          expiresAt: true,
          skills: {
            include: {
              skill: { select: { id: true, name: true, slug: true } },
            },
          },
          _count: { select: { applications: true } },
        },
        orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return {
      items,
      total,
      page,
      pageSize,
      pageCount: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  async listAdminCompanies(query: {
    search?: string;
    verificationStatus?: string;
    page?: string | number;
    pageSize?: string | number;
  }) {
    const rawPage = Number(query?.page ?? 1);
    const rawPageSize = Number(query?.pageSize ?? 20);
    const page = Number.isFinite(rawPage) ? Math.max(1, Math.floor(rawPage)) : 1;
    const pageSize = Number.isFinite(rawPageSize)
      ? Math.max(1, Math.min(100, Math.floor(rawPageSize)))
      : 20;

    const where: any = {};
    if (
      query?.verificationStatus &&
      query.verificationStatus !== 'ALL' &&
      Object.values(VerificationStatus).includes(
        query.verificationStatus as VerificationStatus,
      )
    ) {
      where.verificationStatus = query.verificationStatus as VerificationStatus;
    }
    if (query?.search && String(query.search).trim()) {
      const q = String(query.search).trim();
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { industry: { contains: q, mode: 'insensitive' } },
        { contactEmail: { contains: q, mode: 'insensitive' } },
      ];
    }

    const [total, items] = await Promise.all([
      this.prisma.company.count({ where }),
      this.prisma.company.findMany({
        where,
        include: {
          _count: {
            select: {
              jobs: true,
              assessments: true,
              members: true,
              verifications: true,
            },
          },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return {
      items,
      total,
      page,
      pageSize,
      pageCount: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  async listAdminApplications(query: {
    search?: string;
    status?: string;
    page?: string | number;
    pageSize?: string | number;
  }) {
    const rawPage = Number(query?.page ?? 1);
    const rawPageSize = Number(query?.pageSize ?? 20);
    const page = Number.isFinite(rawPage) ? Math.max(1, Math.floor(rawPage)) : 1;
    const pageSize = Number.isFinite(rawPageSize)
      ? Math.max(1, Math.min(100, Math.floor(rawPageSize)))
      : 20;

    const where: any = {};
    if (
      query?.status &&
      query.status !== 'ALL' &&
      Object.values(ApplicationStatus).includes(query.status as ApplicationStatus)
    ) {
      where.status = query.status as ApplicationStatus;
    }
    if (query?.search && String(query.search).trim()) {
      const q = String(query.search).trim();
      where.OR = [
        { job: { title: { contains: q, mode: 'insensitive' } } },
        { job: { companyName: { contains: q, mode: 'insensitive' } } },
        { candidate: { fullName: { contains: q, mode: 'insensitive' } } },
        { candidate: { user: { email: { contains: q, mode: 'insensitive' } } } },
      ];
    }

    const [total, items] = await Promise.all([
      this.prisma.jobApplication.count({ where }),
      this.prisma.jobApplication.findMany({
        where,
        include: {
          job: {
            select: {
              id: true,
              title: true,
              companyName: true,
              source: true,
            },
          },
          candidate: {
            select: {
              id: true,
              fullName: true,
              user: { select: { email: true } },
            },
          },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return {
      items,
      total,
      page,
      pageSize,
      pageCount: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  private sanitizeAdminVerification(v: any) {
    const files = Array.isArray((v.documents as any)?.files)
      ? (v.documents as any).files.map((f: any, index: number) => ({
          index,
          name: f.name,
          type: f.type,
          size: f.size,
          downloadUrl: `/admin/verifications/${v.id}/documents/${index}`,
        }))
      : [];

    return {
      id: v.id,
      companyId: v.companyId,
      company: v.company,
      companyName: v.company?.name || '',
      businessRegNo: v.businessRegNo,
      businessRegistrationNo: v.businessRegNo,
      status: v.status,
      verificationStatus: v.status,
      user: { email: v.company?.contactEmail || '' },
      reviewedBy: v.reviewedBy,
      reviewedAt: v.reviewedAt,
      rejectionReason: v.rejectionReason,
      createdAt: v.createdAt,
      documents: { files },
    };
  }

  async listVerifications(query: {
    status?: string;
    page?: string | number;
    pageSize?: string | number;
    paginated?: string;
  }) {
    const statusFilter =
      query.status &&
      Object.values(VerificationStatus).includes(query.status as VerificationStatus)
        ? (query.status as VerificationStatus)
        : undefined;

    const rawPage = Number(query.page ?? 1);
    const rawPageSize = Number(query.pageSize ?? 20);
    const page = Number.isFinite(rawPage) ? Math.max(1, Math.floor(rawPage)) : 1;
    const pageSize = Number.isFinite(rawPageSize)
      ? Math.max(1, Math.min(50, Math.floor(rawPageSize)))
      : 20;

    const where = statusFilter ? { status: statusFilter } : {};

    if (query.paginated === 'true') {
      const [total, items, pendingCount, verifiedCount, rejectedCount] =
        await Promise.all([
          this.prisma.companyVerification.count({ where }),
          this.prisma.companyVerification.findMany({
            where,
            include: {
              company: {
                select: {
                  id: true,
                  name: true,
                  slug: true,
                  website: true,
                  contactEmail: true,
                  contactPhone: true,
                  verificationStatus: true,
                },
              },
            },
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            skip: (page - 1) * pageSize,
            take: pageSize,
          }),
          this.prisma.companyVerification.count({
            where: { status: VerificationStatus.PENDING },
          }),
          this.prisma.companyVerification.count({
            where: { status: VerificationStatus.VERIFIED },
          }),
          this.prisma.companyVerification.count({
            where: { status: VerificationStatus.REJECTED },
          }),
        ]);

      return {
        items: items.map((v) => this.sanitizeAdminVerification(v)),
        total,
        counts: {
          PENDING: pendingCount,
          VERIFIED: verifiedCount,
          REJECTED: rejectedCount,
        },
        page,
        pageSize,
        pageCount: Math.max(1, Math.ceil(total / pageSize)),
      };
    }

    const list = await this.prisma.companyVerification.findMany({
      where,
      include: {
        company: {
          select: {
            id: true,
            name: true,
            slug: true,
            website: true,
            contactEmail: true,
            contactPhone: true,
            verificationStatus: true,
          },
        },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 100,
    });

    return list.map((v) => this.sanitizeAdminVerification(v));
  }

  async downloadVerificationDocument(verificationId: string, indexStr: string) {
    const verification = await this.prisma.companyVerification.findUnique({
      where: { id: verificationId },
    });

    if (!verification) {
      throw new NotFoundException('Verification request not found.');
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

  async reviewVerification(
    adminUser: any,
    verificationId: string,
    body: { action: 'APPROVE' | 'REJECT'; reason?: string },
  ) {
    const verification = await this.prisma.companyVerification.findUnique({
      where: { id: verificationId },
      include: {
        company: { include: { members: true } },
      },
    });

    if (!verification) {
      throw new NotFoundException('Verification request not found.');
    }

    if (verification.status !== VerificationStatus.PENDING) {
      throw new ConflictException(
        `Verification request has already been reviewed (status: ${verification.status}).`,
      );
    }

    // Verify this is the latest verification request for the company
    const latest = await this.prisma.companyVerification.findFirst({
      where: { companyId: verification.companyId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });

    if (latest && latest.id !== verification.id) {
      throw new ConflictException(
        'Can only review the latest pending verification request for this company.',
      );
    }

    const action = String(body?.action || '').toUpperCase();
    if (action !== 'APPROVE' && action !== 'REJECT') {
      throw new BadRequestException('action must be APPROVE or REJECT.');
    }

    let rejectionReason: string | null = null;
    if (action === 'REJECT') {
      rejectionReason = String(body?.reason || '').trim();
      if (rejectionReason.length < 10 || rejectionReason.length > 2000) {
        throw new BadRequestException(
          'Rejection reason must be between 10 and 2000 characters.',
        );
      }
    }

    const newStatus =
      action === 'APPROVE'
        ? VerificationStatus.VERIFIED
        : VerificationStatus.REJECTED;

    const updated = await this.prisma.$transaction(async (tx) => {
      const ver = await tx.companyVerification.update({
        where: { id: verification.id },
        data: {
          status: newStatus,
          reviewedBy: adminUser.id,
          reviewedAt: new Date(),
          rejectionReason,
        },
        include: { company: true },
      });

      await tx.company.update({
        where: { id: verification.companyId },
        data: { verificationStatus: newStatus },
      });

      return ver;
    });

    for (const member of verification.company?.members || []) {
      await this.notifications.createNotification({
        userId: member.userId,
        type: NotificationType.SYSTEM_ANNOUNCEMENT,
        title:
          newStatus === VerificationStatus.VERIFIED
            ? 'บริษัทยืนยันตัวตนสำเร็จ (VERIFIED)'
            : 'คำขอยืนยันตัวตนบริษัทถูกปฏิเสธ (REJECTED)',
        message:
          newStatus === VerificationStatus.VERIFIED
            ? `คำขอยืนยันบริษัท "${verification.company.name}" ได้รับการอนุมัติแล้ว`
            : `คำขอยืนยันบริษัท "${verification.company.name}" ไม่ผ่านการอนุมัติ: ${rejectionReason}`,
        link: `/company/profile`,
        metadata: { verificationId: verification.id, status: newStatus },
      });
    }

    await this.audit.log(
      adminUser?.id,
      action === 'APPROVE' ? 'VERIFICATION_APPROVE' : 'VERIFICATION_REJECT',
      'VERIFICATION',
      updated.id,
      {
        companyId: updated.companyId,
        companyName: updated.company?.name,
        businessRegNo: updated.businessRegNo,
        status: newStatus,
        rejectionReason,
      },
    );

    return this.sanitizeAdminVerification(updated);
  }

  private normalizeFeedbackVisibility(
    raw?: string,
    required = false,
  ): FeedbackVisibility {
    if (raw === undefined || raw === null || String(raw).trim() === '') {
      if (required) {
        throw new BadRequestException(
          'feedbackVisibility is required (IMMEDIATE, AFTER_REVIEW, or PRIVATE_TO_COMPANY).',
        );
      }
      return FeedbackVisibility.IMMEDIATE;
    }

    const val = String(raw).trim().toUpperCase();
    if (val === 'IMMEDIATE' || val === 'FULL_REVIEW') {
      return FeedbackVisibility.IMMEDIATE;
    }
    if (val === 'AFTER_REVIEW' || val === 'SUMMARY_ONLY') {
      return FeedbackVisibility.AFTER_REVIEW;
    }
    if (
      val === 'PRIVATE_TO_COMPANY' ||
      val === 'HIDDEN' ||
      val === 'SCORE_ONLY'
    ) {
      return FeedbackVisibility.PRIVATE_TO_COMPANY;
    }

    throw new BadRequestException(
      `Invalid feedbackVisibility "${raw}". Allowed: IMMEDIATE, AFTER_REVIEW, PRIVATE_TO_COMPANY.`,
    );
  }

  private normalizeAssessmentType(rawType?: string, fallback?: AssessmentType): AssessmentType {
    if (!rawType) return fallback || AssessmentType.PRACTICAL_CODING;
    const upper = String(rawType).trim().toUpperCase();
    if (upper === 'THEORY' || upper === 'THEORY_SYNTHESIS') {
      return AssessmentType.THEORY;
    }
    if (
      upper === 'PRACTICAL_CODING' ||
      upper === 'CODING_SANDBOX' ||
      upper === 'CODING'
    ) {
      return AssessmentType.PRACTICAL_CODING;
    }
    throw new BadRequestException(
      `Invalid assessment type "${rawType}". Allowed: THEORY, PRACTICAL_CODING.`,
    );
  }

  private normalizeQuestionsInput(
    rawQuestions: any[],
    type: AssessmentType,
    assessmentTitle: string,
  ) {
    return rawQuestions.map((q, idx) => {
      const qTitle =
        q?.title && String(q.title).trim()
          ? String(q.title).trim()
          : `${String(assessmentTitle || 'Platform Question').trim()} - Q${idx + 1}`;
      let choices = q?.choices;
      if (
        type === AssessmentType.THEORY &&
        !Array.isArray(choices) &&
        Array.isArray(q?.options)
      ) {
        const correctIdx = String(q.correctAnswer ?? '0');
        choices = q.options.map((opt: string, optIdx: number) => ({
          text: String(opt),
          isCorrect: String(optIdx) === correctIdx || String(opt) === correctIdx,
          order: optIdx + 1,
        }));
      }
      const solutionCode =
        q?.solutionCode !== undefined &&
        q?.solutionCode !== null &&
        String(q.solutionCode).trim() !== ''
          ? String(q.solutionCode)
          : null;

      return {
        ...q,
        title: qTitle,
        choices,
        solutionCode,
      };
    });
  }

  private enrichPlatformAssessment(exam: any, readiness: any) {
    return {
      ...exam,
      examType: exam.type,
      assessmentRole:
        exam.type === AssessmentType.THEORY ? 'THEORY_SYNTHESIS' : 'PRACTICAL_CODING',
      status: exam.isActive ? 'PUBLISHED' : 'RETIRED',
      isReady: readiness.isReady,
      readinessError: readiness.readinessError,
      frameworkCoverage: readiness.frameworkCoverage,
    };
  }

  // Platform Assessments Management
  async listPlatformAssessments() {
    const exams = await this.prisma.assessment.findMany({
      where: { companyId: null },
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
      return this.enrichPlatformAssessment(exam, readiness);
    });
  }

  async getPlatformAssessmentById(assessmentId: string) {
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

    if (!exam || exam.companyId !== null) {
      throw new NotFoundException('Platform assessment not found.');
    }

    const readiness = validateAssessmentReadiness(exam as any);
    return this.enrichPlatformAssessment(exam, readiness);
  }

  async createPlatformAssessment(body: Record<string, any>, adminUser?: any) {
    const type = this.normalizeAssessmentType(body.type || body.examType);
    const rawPassing = Number(body.passingScore);
    const passingScore =
      Number.isFinite(rawPassing) && rawPassing > 0 ? rawPassing : 70;

    const rawQuestions: any[] = Array.isArray(body.questions) ? body.questions : [];
    const questionsInput = this.normalizeQuestionsInput(
      rawQuestions,
      type,
      body.title || 'Platform Question',
    );

    const feedbackVisibility = this.normalizeFeedbackVisibility(
      body.feedbackVisibility,
      false,
    );

    let isActive = true;
    if (body.isActive !== undefined) {
      if (typeof body.isActive !== 'boolean') {
        throw new BadRequestException('isActive must be a boolean.');
      }
      isActive = body.isActive;
    } else if (body.status !== undefined) {
      const st = String(body.status).trim().toUpperCase();
      if (st === 'PUBLISHED') isActive = true;
      else if (st === 'RETIRED') isActive = false;
      else {
        throw new BadRequestException(
          `Invalid status "${body.status}". Allowed: PUBLISHED, RETIRED.`,
        );
      }
    }

    const payloadToValidate = {
      companyId: null,
      title: body.title,
      type,
      skillId: body.skillId || null,
      timeLimitMinutes: Number(body.timeLimitMinutes ?? body.timeLimitMins ?? 30),
      passingScore,
      feedbackVisibility,
      frameworkCode: body.frameworkCode || null,
      frameworkVersion: body.frameworkVersion || null,
      frameworkScope: body.frameworkScope || null,
      questions: questionsInput,
    };

    const readiness = validateAssessmentReadiness(payloadToValidate);
    if (!readiness.isReady) {
      throw new BadRequestException(
        readiness.readinessError || 'Invalid assessment payload.',
      );
    }

    if (payloadToValidate.skillId) {
      const sk = await this.prisma.skill.findUnique({
        where: { id: String(payloadToValidate.skillId) },
      });
      if (!sk) {
        throw new BadRequestException('Specified skillId does not exist.');
      }
    }

    const slug = `${
      String(body.title)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') || 'platform-exam'
    }-${crypto.randomBytes(3).toString('hex')}`;

    const created = await this.prisma.assessment.create({
      data: {
        companyId: null,
        title: String(body.title).trim(),
        slug,
        description: body.description ? String(body.description).trim() : null,
        type,
        skillId: payloadToValidate.skillId,
        timeLimitMinutes: payloadToValidate.timeLimitMinutes,
        passingScore: payloadToValidate.passingScore,
        feedbackVisibility: payloadToValidate.feedbackVisibility as FeedbackVisibility,
        frameworkCode: payloadToValidate.frameworkCode,
        frameworkVersion: payloadToValidate.frameworkVersion,
        frameworkScope: payloadToValidate.frameworkScope,
        isActive,
        questions: {
          create: questionsInput.map((q) => ({
            title: String(q.title).trim(),
            prompt: String(q.prompt).trim(),
            difficulty: (q.difficulty || QuestionDifficulty.MEDIUM) as QuestionDifficulty,
            points: Number(q.points || 10),
            starterCode: q.starterCode ?? null,
            solutionCode: q.solutionCode ?? null,
            explanation: q.explanation ?? null,
            evaluationMethod: (q.evaluationMethod ||
              QuestionEvaluationMethod.AUTOMATED_TEST_CASES) as QuestionEvaluationMethod,
            testCases: q.testCases ?? null,
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

    await this.audit.log(
      adminUser?.id,
      'ASSESSMENT_CREATE',
      'ASSESSMENT',
      created.id,
      {
        title: created.title,
        type: created.type,
        isActive: created.isActive,
        feedbackVisibility: created.feedbackVisibility,
        questionCount: created.questions.length,
      },
    );

    return this.enrichPlatformAssessment(created, readiness);
  }

  async updatePlatformAssessment(
    assessmentId: string,
    body: Record<string, any>,
    adminUser?: any,
  ) {
    const existing = await this.getPlatformAssessmentById(assessmentId);

    const normalizedVisibility =
      body.feedbackVisibility !== undefined
        ? this.normalizeFeedbackVisibility(body.feedbackVisibility, true)
        : existing.feedbackVisibility;

    if (existing._count.attempts > 0) {
      const requestedType =
        body.type !== undefined || body.examType !== undefined
          ? this.normalizeAssessmentType(body.type || body.examType, existing.type)
          : undefined;
      const scoringChanged =
        (requestedType !== undefined && requestedType !== existing.type) ||
        (body.timeLimitMinutes !== undefined &&
          Number(body.timeLimitMinutes) !== existing.timeLimitMinutes) ||
        (body.passingScore !== undefined &&
          Number(body.passingScore) !== existing.passingScore) ||
        body.questions !== undefined;

      if (scoringChanged) {
        throw new BadRequestException(
          'Cannot modify questions or scoring criteria of an assessment that already has candidate attempts.',
        );
      }

      const updatedLocked = await this.prisma.assessment.update({
        where: { id: existing.id },
        data: {
          title: body.title ? String(body.title).trim() : existing.title,
          description:
            body.description !== undefined ? body.description : existing.description,
          feedbackVisibility: normalizedVisibility as FeedbackVisibility,
          version: { increment: 1 },
        },
        include: {
          skill: true,
          questions: { include: { choices: true } },
          _count: { select: { attempts: true } },
        },
      });

      await this.audit.log(
        adminUser?.id,
        'ASSESSMENT_UPDATE',
        'ASSESSMENT',
        updatedLocked.id,
        {
          title: updatedLocked.title,
          version: updatedLocked.version,
          lockedByAttempts: true,
        },
      );

      const readiness = validateAssessmentReadiness(updatedLocked as any);
      return this.enrichPlatformAssessment(updatedLocked, readiness);
    }

    const type =
      body.type !== undefined || body.examType !== undefined
        ? this.normalizeAssessmentType(body.type || body.examType, existing.type)
        : (existing.type as AssessmentType);

    const nextTitle = body.title ?? existing.title;
    const questionsInput: any[] = Array.isArray(body.questions)
      ? this.normalizeQuestionsInput(body.questions, type, nextTitle)
      : existing.questions;

    const payloadToValidate = {
      companyId: null,
      title: nextTitle,
      type,
      skillId: body.skillId !== undefined ? body.skillId : existing.skillId,
      timeLimitMinutes: Number(body.timeLimitMinutes ?? existing.timeLimitMinutes),
      passingScore: Number(body.passingScore ?? existing.passingScore),
      feedbackVisibility: normalizedVisibility,
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
      throw new BadRequestException(
        readiness.readinessError || 'Invalid assessment update.',
      );
    }

    if (payloadToValidate.skillId) {
      const sk = await this.prisma.skill.findUnique({
        where: { id: String(payloadToValidate.skillId) },
      });
      if (!sk) {
        throw new BadRequestException('Specified skillId does not exist.');
      }
    }

    const updated = await this.prisma.$transaction(async (tx) => {
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
                    points: Number(q.points || 10),
                    starterCode: q.starterCode ?? null,
                    solutionCode: q.solutionCode ?? null,
                    explanation: q.explanation ?? null,
                    evaluationMethod: (q.evaluationMethod ||
                      QuestionEvaluationMethod.AUTOMATED_TEST_CASES) as QuestionEvaluationMethod,
                    testCases: q.testCases ?? null,
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
          _count: { select: { attempts: true } },
        },
      });
    });

    await this.audit.log(
      adminUser?.id,
      'ASSESSMENT_UPDATE',
      'ASSESSMENT',
      updated.id,
      {
        title: updated.title,
        version: updated.version,
        questionCount: updated.questions.length,
      },
    );

    return this.enrichPlatformAssessment(updated, readiness);
  }

  async deletePlatformAssessment(assessmentId: string, adminUser?: any) {
    const existing = await this.getPlatformAssessmentById(assessmentId);
    if (existing._count.attempts > 0) {
      throw new BadRequestException(
        'Cannot delete an assessment that already has candidate attempts. Deactivate it instead.',
      );
    }

    await this.prisma.assessment.delete({ where: { id: existing.id } });

    await this.audit.log(
      adminUser?.id,
      'ASSESSMENT_DELETE',
      'ASSESSMENT',
      existing.id,
      { title: existing.title },
    );

    return { deleted: true, id: existing.id };
  }

  async togglePlatformAssessment(assessmentId: string, adminUser?: any) {
    const existing = await this.getPlatformAssessmentById(assessmentId);
    if (!existing.isActive) {
      const readiness = validateAssessmentReadiness(existing as any);
      if (!readiness.isReady) {
        throw new BadRequestException(
          `Cannot activate assessment: ${readiness.readinessError}`,
        );
      }
    }

    const updated = await this.prisma.assessment.update({
      where: { id: existing.id },
      data: { isActive: !existing.isActive },
    });

    await this.audit.log(
      adminUser?.id,
      'ASSESSMENT_STATUS',
      'ASSESSMENT',
      updated.id,
      { title: updated.title, isActive: updated.isActive },
    );

    return updated;
  }

  async updatePlatformAssessmentStatus(
    assessmentId: string,
    body: { status?: string; isActive?: boolean },
    adminUser?: any,
  ) {
    const existing = await this.getPlatformAssessmentById(assessmentId);

    let desiredActive: boolean;
    if (body.isActive !== undefined) {
      if (typeof body.isActive !== 'boolean') {
        throw new BadRequestException('isActive must be a boolean value.');
      }
      desiredActive = body.isActive;
    } else if (body.status !== undefined && String(body.status).trim() !== '') {
      const st = String(body.status).trim().toUpperCase();
      if (st === 'PUBLISHED') {
        desiredActive = true;
      } else if (st === 'RETIRED') {
        desiredActive = false;
      } else {
        throw new BadRequestException(
          `Invalid assessment status "${body.status}". Allowed: PUBLISHED, RETIRED.`,
        );
      }
    } else {
      throw new BadRequestException(
        'Must provide status (PUBLISHED or RETIRED) or isActive (boolean).',
      );
    }

    if (desiredActive && !existing.isActive) {
      const readiness = validateAssessmentReadiness(existing as any);
      if (!readiness.isReady) {
        throw new BadRequestException(
          `Cannot activate assessment: ${readiness.readinessError}`,
        );
      }
    }

    const updated = await this.prisma.assessment.update({
      where: { id: existing.id },
      data: { isActive: desiredActive },
    });

    const status = updated.isActive ? 'PUBLISHED' : 'RETIRED';

    await this.audit.log(
      adminUser?.id,
      'ASSESSMENT_STATUS',
      'ASSESSMENT',
      updated.id,
      { title: updated.title, status, isActive: updated.isActive },
    );

    return {
      ...updated,
      status,
    };
  }

  async updatePlatformAssessmentFeedbackVisibility(
    assessmentId: string,
    body: { feedbackVisibility: string },
    adminUser?: any,
  ) {
    const existing = await this.getPlatformAssessmentById(assessmentId);
    const feedbackVisibility = this.normalizeFeedbackVisibility(
      body?.feedbackVisibility,
      true,
    );

    const updated = await this.prisma.assessment.update({
      where: { id: existing.id },
      data: { feedbackVisibility },
    });

    await this.audit.log(
      adminUser?.id,
      'ASSESSMENT_FEEDBACK_VISIBILITY',
      'ASSESSMENT',
      updated.id,
      { title: updated.title, feedbackVisibility: updated.feedbackVisibility },
    );

    return updated;
  }

  async listPlatformAssessmentAttempts(assessmentId: string) {
    await this.getPlatformAssessmentById(assessmentId);
    const attempts = await this.prisma.assessmentAttempt.findMany({
      where: { assessmentId },
      include: {
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
      orderBy: { startedAt: 'desc' },
    });

    return attempts.map((att) => ({
      ...att,
      effectivePercentage: readAttemptPercentage(att as any),
    }));
  }
}
