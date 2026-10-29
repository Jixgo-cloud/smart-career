import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { NotificationType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

export interface DevelopmentPlanSkillItem {
  skillId: string;
  skillName: string;
  category: string;
  progress: {
    status: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED';
    note: string | null;
    evidenceUrl: string | null;
    updatedAt: string | null;
  };
}

export interface AreasForImprovementV1 {
  version: 1;
  updatedAt: string;
  developmentNote: string | null;
  skills: DevelopmentPlanSkillItem[];
}

@Injectable()
export class EvaluationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  private validateDimensionScore(val: any, fieldName: string): number {
    const num = Number(val);
    if (!Number.isInteger(num) || num < 1 || num > 5) {
      throw new BadRequestException(`${fieldName} must be an integer between 1 and 5.`);
    }
    return num;
  }

  async upsertEvaluation(
    user: any,
    applicationId: string,
    body: {
      technicalScore: number;
      problemSolvingScore: number;
      communicationScore: number;
      teamworkScore: number;
      overallFeedback: string;
      strengths?: string[];
      developmentSkillIds?: string[];
      developmentNote?: string;
    },
  ) {
    const companyIds = new Set(
      (user.companyMembers || []).map((cm: any) => cm.companyId),
    );
    if (companyIds.size === 0) {
      const dbMember = await this.prisma.companyMember.findFirst({
        where: { userId: user.id },
      });
      if (dbMember) companyIds.add(dbMember.companyId);
    }

    const application = await this.prisma.jobApplication.findUnique({
      where: { id: applicationId },
      include: {
        job: true,
        candidate: true,
        evaluation: true,
      },
    });

    if (!application) {
      throw new NotFoundException('Job application not found.');
    }

    if (!application.job.companyId || !companyIds.has(application.job.companyId)) {
      throw new ForbiddenException(
        'You can only submit evaluations for applications to your own company jobs.',
      );
    }

    const technicalScore = this.validateDimensionScore(
      body?.technicalScore,
      'technicalScore',
    );
    const problemSolvingScore = this.validateDimensionScore(
      body?.problemSolvingScore,
      'problemSolvingScore',
    );
    const communicationScore = this.validateDimensionScore(
      body?.communicationScore,
      'communicationScore',
    );
    const teamworkScore = this.validateDimensionScore(
      body?.teamworkScore,
      'teamworkScore',
    );

    const overallFeedback = String(body?.overallFeedback || '').trim();
    if (!overallFeedback || overallFeedback.length > 5000) {
      throw new BadRequestException(
        'overallFeedback is required and must not exceed 5000 characters.',
      );
    }

    const strengthsInput = Array.isArray(body?.strengths) ? body.strengths : [];
    if (strengthsInput.length > 10) {
      throw new BadRequestException('strengths cannot exceed 10 items.');
    }
    const strengths = strengthsInput.map((s, idx) => {
      const text = String(s || '').trim();
      if (!text || text.length > 300) {
        throw new BadRequestException(
          `strengths[${idx}] must be between 1 and 300 characters.`,
        );
      }
      return text;
    });

    const skillIdsInput = Array.isArray(body?.developmentSkillIds)
      ? body.developmentSkillIds
      : [];
    if (skillIdsInput.length > 10) {
      throw new BadRequestException('developmentSkillIds cannot exceed 10 skills.');
    }
    const uniqueSkillIds = Array.from(new Set(skillIdsInput.map((id) => String(id).trim())));
    if (uniqueSkillIds.length !== skillIdsInput.length) {
      throw new BadRequestException('developmentSkillIds must not contain duplicates.');
    }

    const skills =
      uniqueSkillIds.length > 0
        ? await this.prisma.skill.findMany({
            where: { id: { in: uniqueSkillIds } },
          })
        : [];

    if (skills.length !== uniqueSkillIds.length) {
      throw new BadRequestException('One or more developmentSkillIds do not exist.');
    }
    const skillMap = new Map(skills.map((s) => [s.id, s]));

    const developmentNote =
      body?.developmentNote !== undefined && body?.developmentNote !== null
        ? String(body.developmentNote).trim()
        : null;
    if (developmentNote && developmentNote.length > 3000) {
      throw new BadRequestException('developmentNote cannot exceed 3000 characters.');
    }

    // Preserve existing progress if updating evaluation
    const existingEval = application.evaluation;
    const existingAreas = (existingEval?.areasForImprovement as unknown as AreasForImprovementV1) || null;
    const existingProgressBySkill = new Map<string, DevelopmentPlanSkillItem['progress']>();
    if (existingAreas && Array.isArray(existingAreas.skills)) {
      for (const item of existingAreas.skills) {
        if (item?.skillId && item?.progress) {
          existingProgressBySkill.set(item.skillId, item.progress);
        }
      }
    }

    // Check if this is an identical retry to avoid duplicate notification
    const isUnchangedRetry =
      Boolean(existingEval) &&
      existingEval!.technicalScore === technicalScore &&
      existingEval!.problemSolvingScore === problemSolvingScore &&
      existingEval!.communicationScore === communicationScore &&
      existingEval!.teamworkScore === teamworkScore &&
      existingEval!.overallFeedback === overallFeedback &&
      JSON.stringify(existingEval!.strengths) === JSON.stringify(strengths) &&
      (existingAreas?.developmentNote ?? null) === developmentNote &&
      JSON.stringify((existingAreas?.skills || []).map((s) => s.skillId)) ===
        JSON.stringify(uniqueSkillIds);

    if (isUnchangedRetry && existingEval) {
      return existingEval;
    }

    const nowIso = new Date().toISOString();
    const areasPayload: AreasForImprovementV1 = {
      version: 1,
      updatedAt: nowIso,
      developmentNote,
      skills: uniqueSkillIds.map((skillId) => {
        const sk = skillMap.get(skillId)!;
        const prevProgress = existingProgressBySkill.get(skillId);
        return {
          skillId: sk.id,
          skillName: sk.name,
          category: sk.category,
          progress: prevProgress || {
            status: 'NOT_STARTED',
            note: null,
            evidenceUrl: null,
            updatedAt: null,
          },
        };
      }),
    };

    const saved = await this.prisma.companyEvaluation.upsert({
      where: { applicationId: application.id },
      update: {
        technicalScore,
        problemSolvingScore,
        communicationScore,
        teamworkScore,
        overallFeedback,
        strengths: strengths as any,
        areasForImprovement: areasPayload as any,
      },
      create: {
        applicationId: application.id,
        companyId: application.job.companyId,
        candidateId: application.candidateId,
        technicalScore,
        problemSolvingScore,
        communicationScore,
        teamworkScore,
        overallFeedback,
        strengths: strengths as any,
        areasForImprovement: areasPayload as any,
      },
    });

    if (application.candidate?.userId) {
      await this.notifications.createNotification({
        userId: application.candidate.userId,
        type: NotificationType.APPLICATION_STATUS_CHANGED,
        title: 'ได้รับข้อเสนอแนะและแผนพัฒนาทักษะจากบริษัท',
        message: `บริษัทได้ส่งผลการประเมินและคำแนะนำการพัฒนาทักษะสำหรับตำแหน่ง "${application.job.title}"`,
        link: `/learning-plan`,
        metadata: {
          evaluationId: saved.id,
          applicationId: application.id,
          jobId: application.jobId,
        },
      });
    }

    return saved;
  }

  async getMyFeedback(user: any) {
    const candidateId = user?.candidateProfile?.id;
    if (!candidateId) {
      throw new NotFoundException('Candidate profile not found.');
    }

    return this.prisma.companyEvaluation.findMany({
      where: { candidateId },
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
        application: {
          include: {
            job: {
              select: { id: true, title: true, employmentType: true, location: true },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}
