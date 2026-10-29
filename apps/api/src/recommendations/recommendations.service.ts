import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CourseSource } from '@prisma/client';
import {
  assessedSkills,
  resolveCareerDefinition,
  validateAssessmentReadiness,
} from '@smartcareer/shared';
import { PrismaService } from '../prisma/prisma.service';
import {
  hasCourseSkillEvidence,
  mentionsSkill,
  normalizeCourseUrl,
} from './course-skill-evidence';
import { AreasForImprovementV1 } from '../evaluations/evaluations.service';

@Injectable()
export class RecommendationsService {
  constructor(private readonly prisma: PrismaService) {}

  async getSkillGapsAndPlan(
    user: any,
    query?: { targetRole?: string; career?: string },
  ) {
    const candidateId = user?.candidateProfile?.id;
    if (!candidateId) {
      throw new NotFoundException('Candidate profile not found.');
    }

    const profile = await this.prisma.candidateProfile.findUnique({
      where: { id: candidateId },
    });
    const requestedCareer = (query?.targetRole || query?.career || '').trim();
    const targetCareer =
      requestedCareer || profile?.targetCareer?.trim() || null;
    const careerDef = resolveCareerDefinition(targetCareer);

    const priorityLimit = 5;
    const benchmarkPolicy = 'MAX_MINIMUM_SCORE_FROM_RELEVANT_ACTIVE_JOBS';

    if (!targetCareer) {
      return {
        targetCareer: null,
        gaps: [],
        assessmentPlan: [],
        unassessedSkills: [],
        basis: 'TARGET_CAREER_JOBS',
        relevantJobCount: 0,
        priorityLimit,
        benchmarkPolicy,
      };
    }

    const keywords = careerDef
      ? careerDef.keywords
      : [targetCareer.toLowerCase()];

    // 1. Find active non-expired jobs whose title matches targetCareer keywords
    const relevantJobs = await this.prisma.job.findMany({
      where: {
        isActive: true,
        skills: { some: {} },
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        AND: [
          {
            OR: keywords.map((kw) => ({
              title: { contains: kw, mode: 'insensitive' as const },
            })),
          },
        ],
      },
      include: {
        skills: {
          include: { skill: true },
        },
      },
    });

    // Section 8.3: If no relevant jobs match targetCareer, return empty with relevantJobCount=0 (do NOT substitute Full Stack!)
    if (relevantJobs.length === 0) {
      return {
        targetCareer,
        gaps: [],
        assessmentPlan: [],
        unassessedSkills: [],
        basis: 'TARGET_CAREER_JOBS',
        relevantJobCount: 0,
        priorityLimit,
        benchmarkPolicy,
      };
    }

    // 2. Aggregate skill demand and benchmark (max minimumScore)
    const skillStats = new Map<
      string,
      {
        skillId: string;
        skillName: string;
        slug: string;
        category: string;
        requiredCount: number;
        totalDemand: number;
        benchmarkScore: number;
      }
    >();

    for (const job of relevantJobs) {
      for (const js of job.skills) {
        if (!js.skill || js.minimumScore <= 0 || js.minimumScore > 100) continue;
        const existing = skillStats.get(js.skillId);
        if (!existing) {
          skillStats.set(js.skillId, {
            skillId: js.skillId,
            skillName: js.skill.name,
            slug: js.skill.slug,
            category: js.skill.category,
            requiredCount: js.isRequired ? 1 : 0,
            totalDemand: 1,
            benchmarkScore: js.minimumScore,
          });
        } else {
          if (js.isRequired) existing.requiredCount += 1;
          existing.totalDemand += 1;
          if (js.minimumScore > existing.benchmarkScore) {
            existing.benchmarkScore = js.minimumScore;
          }
        }
      }
    }

    // 3. Sort by requiredCount desc -> totalDemand desc -> skillName asc, pick top 5
    const prioritizedSkills = Array.from(skillStats.values())
      .sort((a, b) => {
        if (b.requiredCount !== a.requiredCount) {
          return b.requiredCount - a.requiredCount;
        }
        if (b.totalDemand !== a.totalDemand) {
          return b.totalDemand - a.totalDemand;
        }
        return a.skillName.localeCompare(b.skillName);
      })
      .slice(0, priorityLimit);

    // 4. Load candidate's eligible assessed skills, GitHub evidences, and platform exams/courses
    const [attempts, platformExams, allCourses, candidateSkills] = await Promise.all([
      this.prisma.assessmentAttempt.findMany({
        where: { candidateId },
        include: {
          assessment: { include: { skill: true } },
        },
        orderBy: [{ completedAt: 'desc' }, { startedAt: 'desc' }],
      }),
      this.prisma.assessment.findMany({
        where: {
          companyId: null,
          isActive: true,
          type: 'PRACTICAL_CODING',
        },
        include: {
          skill: true,
          questions: { include: { choices: true } },
        },
      }),
      this.prisma.course.findMany({
        include: {
          skills: { include: { skill: true } },
        },
        orderBy: { rating: 'desc' },
      }),
      this.prisma.candidateSkill.findMany({
        where: { candidateId },
        include: {
          evidences: {
            include: { repository: true },
          },
        },
      }),
    ]);

    const githubEvidencesBySkillId = new Map<string, any[]>(
      candidateSkills.map((cs) => [cs.skillId, cs.evidences || []]),
    );
    const assessedMap = assessedSkills(attempts as any);
    const readyExamsBySkillId = new Map<string, any>();
    for (const exam of platformExams) {
      if (
        exam.skillId &&
        !readyExamsBySkillId.has(exam.skillId) &&
        validateAssessmentReadiness(exam as any).isReady
      ) {
        readyExamsBySkillId.set(exam.skillId, {
          id: exam.id,
          title: exam.title,
          slug: exam.slug,
          timeLimitMinutes: exam.timeLimitMinutes,
          passingScore: exam.passingScore,
        });
      }
    }

    const gaps: any[] = [];
    const matchedSkills: any[] = [];
    const assessmentPlan: any[] = [];
    const unassessedSkills: any[] = [];

    for (const item of prioritizedSkills) {
      const assessed = assessedMap.get(item.skillId);
      const readyExam = readyExamsBySkillId.get(item.skillId) || null;
      const ghEvidences = githubEvidencesBySkillId.get(item.skillId) || [];
      const hasGithubEvidence = ghEvidences.length > 0;
      const githubRepoNames = Array.from(
        new Set(
          ghEvidences
            .map((e) => e.repository?.name || e.repository?.repoName || e.repository?.fullName)
            .filter(Boolean),
        ),
      );
      const githubRepoCount = Math.max(githubRepoNames.length, ghEvidences.length);

      let verifiedCourses = allCourses
        .filter(
          (c) =>
            c.url.startsWith('https://') &&
            !c.title.toLowerCase().includes('[closed]') &&
            c.skills.some((cs) => cs.skillId === item.skillId) &&
            hasCourseSkillEvidence(c, { name: item.skillName, slug: item.slug }),
        )
        .sort((a, b) => {
          const aTitleMatch = mentionsSkill(a.title || '', item.skillName) ? 1 : 0;
          const bTitleMatch = mentionsSkill(b.title || '', item.skillName) ? 1 : 0;
          if (bTitleMatch !== aTitleMatch) return bTitleMatch - aTitleMatch;
          return (b.rating || 0) - (a.rating || 0);
        })
        .slice(0, 3);

      if (verifiedCourses.length === 0) {
        verifiedCourses = allCourses
          .filter(
            (c) =>
              c.url.startsWith('https://') &&
              !c.title.toLowerCase().includes('[closed]') &&
              c.skills.some((cs) => cs.skillId === item.skillId),
          )
          .slice(0, 3);
      }

      if (!hasGithubEvidence && !assessed) {
        const missingEntry = {
          skillId: item.skillId,
          skillName: item.skillName,
          category: item.category,
          requiredLevel: item.benchmarkScore,
          currentLevel: null,
          priority: item.requiredCount > 0 ? 'HIGH' : 'MEDIUM',
          status: 'MISSING_FROM_GITHUB',
          requiredJobCount: item.requiredCount,
          totalJobDemand: item.totalDemand,
          hasGithubEvidence: false,
          githubRepoCount: 0,
          githubRepoNames: [],
          availableAssessment: readyExam,
          recommendedCourses: verifiedCourses,
          reason: `ตลาดต้องการใน ${item.totalDemand} ตำแหน่งงาน — แนะนำให้เรียนคอร์สเพื่อเพิ่มทักษะนี้เข้าโปรไฟล์`,
        };
        gaps.push(missingEntry);
        unassessedSkills.push(missingEntry);
        assessmentPlan.push(missingEntry);
        continue;
      }

      const matchedEntry = {
        skillId: item.skillId,
        skillName: item.skillName,
        category: item.category,
        requiredLevel: item.benchmarkScore,
        currentLevel: assessed ? assessed.score : null,
        examScore: assessed ? assessed.score : null,
        status: 'MATCHED',
        requiredJobCount: item.requiredCount,
        totalJobDemand: item.totalDemand,
        hasGithubEvidence,
        githubRepoCount,
        githubRepoNames,
        availableAssessment: readyExam,
        reason: assessed
          ? `มีผลสอบปฏิบัติยืนยันแล้ว (${assessed.score}%)`
          : `พบใน GitHub ของคุณแล้ว (${githubRepoCount} โปรเจกต์) • ทางเลือกเสริม: สอบปฏิบัติเพื่อเพิ่มคะแนนยืนยันให้บริษัทพิจารณา`,
      };
      matchedSkills.push(matchedEntry);

      if (!assessed) {
        unassessedSkills.push({
          ...matchedEntry,
          status: 'NOT_ASSESSED',
        });
        assessmentPlan.push(matchedEntry);
      }
    }

    return {
      targetCareer,
      gaps,
      matchedSkills,
      assessmentPlan,
      unassessedSkills,
      basis: 'GITHUB_AND_TARGET_CAREER_JOBS',
      relevantJobCount: relevantJobs.length,
      priorityLimit,
      benchmarkPolicy,
    };
  }

  async searchCourses(query: {
    keyword?: string;
    search?: string;
    provider?: string;
    career?: string;
    skillId?: string;
  }) {
    const searchTerm = (query.keyword || query.search || '').trim();
    const courses = await this.prisma.course.findMany({
      where: {
        ...(query.provider &&
        Object.values(CourseSource).includes(query.provider as CourseSource)
          ? { provider: query.provider as CourseSource }
          : {}),
        ...(searchTerm
          ? {
              OR: [
                { title: { contains: searchTerm, mode: 'insensitive' } },
                {
                  description: {
                    contains: searchTerm,
                    mode: 'insensitive',
                  },
                },
                {
                  source: {
                    contains: searchTerm,
                    mode: 'insensitive',
                  },
                },
              ],
            }
          : {}),
        ...(query.skillId ? { skills: { some: { skillId: query.skillId } } } : {}),
      },
      include: {
        skills: { include: { skill: true } },
      },
      orderBy: [{ rating: 'desc' }, { createdAt: 'desc' }],
    });

    const careerDef = query.career ? resolveCareerDefinition(query.career) : null;
    const seenUrls = new Set<string>();
    const results = [];

    for (const c of courses) {
      if (
        !c.url.startsWith('https://') ||
        c.title.toLowerCase().includes('[closed]')
      ) {
        continue;
      }

      // Filter skills to only those supported by textual evidence in title/description
      const verifiedSkills = c.skills.filter(
        (cs) => cs.skill && hasCourseSkillEvidence(c, cs.skill),
      );

      if (query.skillId && !verifiedSkills.some((cs) => cs.skillId === query.skillId)) {
        continue;
      }

      if (
        careerDef &&
        !verifiedSkills.some((cs) =>
          careerDef.categories.includes(cs.skill.category),
        )
      ) {
        continue;
      }

      const normUrl = normalizeCourseUrl(c.url);
      if (seenUrls.has(normUrl)) continue;
      seenUrls.add(normUrl);

      results.push({
        ...c,
        skills: verifiedSkills,
      });
    }

    return results;
  }

  async getDevelopmentPlan(user: any) {
    const candidateId = user?.candidateProfile?.id;
    if (!candidateId) {
      throw new NotFoundException('Candidate profile not found.');
    }

    const [evaluations, allCourses, allSkills] = await Promise.all([
      this.prisma.companyEvaluation.findMany({
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
                select: { id: true, title: true, location: true },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.course.findMany({
        include: { skills: { include: { skill: true } } },
        orderBy: { rating: 'desc' },
      }),
      this.prisma.skill.findMany(),
    ]);

    const skillById = new Map(allSkills.map((s) => [s.id, s]));

    const formattedEvaluations = evaluations.map((ev) => {
      const areas = (ev.areasForImprovement as unknown as AreasForImprovementV1) || {
        version: 1,
        updatedAt: ev.createdAt.toISOString(),
        developmentNote: null,
        skills: [],
      };

      const enrichedSkills = (areas.skills || []).map((item) => {
        const masterSkill = skillById.get(item.skillId);
        const courses = masterSkill
          ? allCourses
              .filter(
                (c) =>
                  c.url.startsWith('https://') &&
                  !c.title.toLowerCase().includes('[closed]') &&
                  c.skills.some((cs) => cs.skillId === item.skillId) &&
                  hasCourseSkillEvidence(c, masterSkill),
              )
              .slice(0, 3)
          : [];

        return {
          skillId: item.skillId,
          skillName: masterSkill?.name || item.skillName,
          category: masterSkill?.category || item.category,
          steps: [
            `ศึกษาแนวคิดหลักและทบทวนพื้นฐาน ${masterSkill?.name || item.skillName}`,
            `ฝึกเขียนโปรเจกต์ย่อยหรือแบบฝึกหัดแล้วแนบลิงก์ผลงาน (HTTPS)`,
            `เข้าทำข้อสอบปฏิบัติในระบบเพื่อประเมินผลซ้ำ`,
          ],
          recommendedCourses: courses,
          progress: item.progress || {
            status: 'NOT_STARTED',
            note: null,
            evidenceUrl: null,
            updatedAt: null,
          },
        };
      });

      return {
        evaluationId: ev.id,
        applicationId: ev.applicationId,
        company: ev.company,
        job: ev.application?.job || null,
        scores: {
          technicalScore: ev.technicalScore,
          problemSolvingScore: ev.problemSolvingScore,
          communicationScore: ev.communicationScore,
          teamworkScore: ev.teamworkScore,
        },
        overallFeedback: ev.overallFeedback,
        strengths: Array.isArray(ev.strengths) ? ev.strengths : [],
        developmentNote: areas.developmentNote ?? null,
        revision: areas.updatedAt || ev.createdAt.toISOString(),
        createdAt: ev.createdAt,
        skills: enrichedSkills,
      };
    });

    return { evaluations: formattedEvaluations };
  }

  async updateSkillProgress(
    user: any,
    evaluationId: string,
    skillId: string,
    body: {
      status: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED';
      note?: string | null;
      evidenceUrl?: string | null;
      revision?: string | null;
      expectedUpdatedAt?: string | null;
    },
  ) {
    const candidateId = user?.candidateProfile?.id;
    const evaluation = await this.prisma.companyEvaluation.findUnique({
      where: { id: evaluationId },
    });

    if (!evaluation) {
      throw new NotFoundException('Evaluation not found.');
    }

    if (evaluation.candidateId !== candidateId) {
      throw new ForbiddenException(
        'You can only update development progress on your own evaluations.',
      );
    }

    const allowedStatuses = ['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED'];
    if (!body?.status || !allowedStatuses.includes(body.status)) {
      throw new BadRequestException(
        'status must be NOT_STARTED, IN_PROGRESS, or COMPLETED.',
      );
    }

    const note =
      body.note !== undefined && body.note !== null ? String(body.note).trim() : null;
    if (note && note.length > 2000) {
      throw new BadRequestException('note cannot exceed 2000 characters.');
    }

    const evidenceUrl =
      body.evidenceUrl !== undefined &&
      body.evidenceUrl !== null &&
      String(body.evidenceUrl).trim() !== ''
        ? String(body.evidenceUrl).trim()
        : null;

    if (evidenceUrl) {
      try {
        const parsedUrl = new URL(evidenceUrl);
        if (parsedUrl.protocol !== 'https:') {
          throw new BadRequestException('evidenceUrl must use HTTPS protocol.');
        }
      } catch (err: any) {
        if (err instanceof BadRequestException) throw err;
        throw new BadRequestException('evidenceUrl must be a valid HTTPS URL.');
      }
    }

    const areas = (evaluation.areasForImprovement as unknown as AreasForImprovementV1) || {
      version: 1 as const,
      updatedAt: evaluation.createdAt.toISOString(),
      developmentNote: null,
      skills: [],
    };

    const currentRevision = areas.updatedAt || evaluation.createdAt.toISOString();
    if (body.revision !== undefined && body.revision !== currentRevision) {
      throw new ConflictException(
        'Development plan revision mismatch. The plan was updated in another session; please reload before saving.',
      );
    }

    const skillIdx = (areas.skills || []).findIndex((s) => s.skillId === skillId);
    if (skillIdx < 0) {
      throw new NotFoundException('Skill is not part of this development plan.');
    }

    const currentSkillEntry = areas.skills[skillIdx];
    const currentSkillUpdatedAt = currentSkillEntry.progress?.updatedAt ?? null;

    if (
      body.expectedUpdatedAt !== undefined &&
      body.expectedUpdatedAt !== currentSkillUpdatedAt
    ) {
      throw new ConflictException(
        'Skill progress expectedUpdatedAt mismatch. Please reload the latest state before saving.',
      );
    }

    const newTimestamp = new Date().toISOString();
    const updatedProgress = {
      status: body.status,
      note,
      evidenceUrl,
      updatedAt: newTimestamp,
    };

    const updatedSkills = [...areas.skills];
    updatedSkills[skillIdx] = {
      ...currentSkillEntry,
      progress: updatedProgress,
    };

    const updatedAreas: AreasForImprovementV1 = {
      ...areas,
      version: 1,
      updatedAt: newTimestamp,
      skills: updatedSkills,
    };

    await this.prisma.companyEvaluation.update({
      where: { id: evaluation.id },
      data: {
        areasForImprovement: updatedAreas as any,
      },
    });

    return {
      evaluationId: evaluation.id,
      skillId,
      revision: newTimestamp,
      updatedAt: newTimestamp,
      progress: updatedProgress,
    };
  }
}
