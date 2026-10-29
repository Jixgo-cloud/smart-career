import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { assessedSkills } from '@smartcareer/shared';

const RADAR_CATEGORIES = [
  { category: 'FRONTEND', subject: 'Frontend' },
  { category: 'BACKEND', subject: 'Backend' },
  { category: 'DATABASE', subject: 'Database' },
  { category: 'DEVOPS', subject: 'DevOps' },
  { category: 'TESTING', subject: 'Testing' },
];

@Injectable()
export class CandidateService {
  constructor(private readonly prisma: PrismaService) {}

  async getOrCreateProfile(userId: string) {
    let profile = await this.prisma.candidateProfile.findUnique({
      where: { userId },
    });

    if (!profile) {
      const user = await this.prisma.user.findUnique({ where: { id: userId } });
      if (!user) throw new NotFoundException('User not found.');
      profile = await this.prisma.candidateProfile.create({
        data: {
          userId,
          fullName: user.email.split('@')[0],
          targetCareer: 'Full Stack Developer',
        },
      });
    }

    return profile;
  }

  async getCandidateAssessedSkillsMap(candidateId: string) {
    const attempts = await this.prisma.assessmentAttempt.findMany({
      where: { candidateId },
      include: {
        assessment: {
          include: { skill: true },
        },
      },
      orderBy: [{ completedAt: 'desc' }, { startedAt: 'desc' }],
    });

    return assessedSkills(attempts as any);
  }

  async getProfile(userId: string) {
    const baseProfile = await this.getOrCreateProfile(userId);

    const profile = await this.prisma.candidateProfile.findUnique({
      where: { id: baseProfile.id },
      include: {
        skills: {
          include: {
            skill: true,
            evidences: {
              include: { repository: true },
            },
          },
        },
        githubRepos: {
          orderBy: { stargazersCount: 'desc' },
        },
        evaluations: {
          include: {
            company: {
              select: { id: true, name: true, slug: true, logoUrl: true },
            },
            application: {
              include: {
                job: { select: { id: true, title: true } },
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!profile) throw new NotFoundException('Candidate profile not found.');

    const assessedMap = await this.getCandidateAssessedSkillsMap(profile.id);
    const allSkills = await this.prisma.skill.findMany({
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
    });

    const candidateSkillBySkillId = new Map(
      profile.skills.map((cs) => [cs.skillId, cs]),
    );

    // Combine assessed skills and GitHub context skills into unified skill view
    const relevantSkillIds = new Set<string>([
      ...Array.from(assessedMap.keys()),
      ...Array.from(candidateSkillBySkillId.keys()),
    ]);

    const skillViews = allSkills
      .filter((sk) => relevantSkillIds.has(sk.id))
      .map((sk) => {
        const assessed = assessedMap.get(sk.id) || null;
        const cs = candidateSkillBySkillId.get(sk.id) || null;
        const evidences = cs?.evidences || [];

        return {
          skillId: sk.id,
          name: sk.name,
          slug: sk.slug,
          category: sk.category,
          assessmentScore: assessed ? assessed.score : null,
          assessmentStatus: assessed ? assessed.status : 'NOT_ASSESSED',
          assessmentResult: assessed
            ? {
                score: assessed.score,
                passingScore: assessed.passingScore,
                passed: assessed.passed,
                attemptId: assessed.attemptId,
                assessmentId: assessed.assessmentId,
                completedAt: assessed.completedAt,
                criteriaHash: assessed.criteriaHash,
                qualityStatus: assessed.qualityStatus,
              }
            : null,
          hasGithubEvidence: evidences.length > 0,
          githubEvidences: evidences.map((ev) => ({
            id: ev.id,
            repositoryId: ev.repositoryId,
            repoFullName: ev.repository?.fullName || null,
            dependencyMatches: ev.dependencyMatches,
            scoreContribution: 0,
          })),
        };
      });

    const eduArr = Array.isArray(profile.education) ? (profile.education as any[]) : [];
    const expArr = Array.isArray(profile.experience) ? (profile.experience as any[]) : [];
    const firstEdu = eduArr[0];
    const educationText =
      typeof profile.education === 'string'
        ? profile.education
        : firstEdu
          ? typeof firstEdu === 'string'
            ? firstEdu
            : [firstEdu.degree, firstEdu.institution].filter(Boolean).join(' - ')
          : '';
    const firstExp = expArr[0];
    const experienceYears =
      firstExp && typeof firstExp === 'object' && typeof firstExp.years === 'number'
        ? firstExp.years
        : 0;
    const location =
      firstExp && typeof firstExp === 'object' && firstExp.location
        ? String(firstExp.location)
        : '';
    const phone =
      firstExp && typeof firstExp === 'object' && firstExp.phone
        ? String(firstExp.phone)
        : '';
    const portfolioUrl =
      firstExp && typeof firstExp === 'object' && firstExp.portfolioUrl
        ? String(firstExp.portfolioUrl)
        : '';
    const isPublic =
      firstExp && typeof firstExp === 'object' && typeof firstExp.isPublic === 'boolean'
        ? firstExp.isPublic
        : true;

    return {
      ...profile,
      desiredRole: profile.targetCareer,
      educationText,
      experienceYears,
      location,
      phone,
      portfolioUrl,
      isPublic,
      githubSummary: profile.githubUsername
        ? {
            username: profile.githubUsername,
            repoCount: profile.githubRepos.length,
          }
        : null,
      githubLastSyncedAt: profile.githubConnectedAt,
      skills: skillViews,
    };
  }

  async updateProfile(userId: string, body: Record<string, any>) {
    const profile = await this.getOrCreateProfile(userId);
    const updateData: Record<string, any> = {};

    if (body.fullName !== undefined) {
      const fullName = String(body.fullName || '').trim();
      if (fullName.length < 1 || fullName.length > 200) {
        throw new BadRequestException('fullName must be between 1 and 200 characters.');
      }
      updateData.fullName = fullName;
    }

    if (body.headline !== undefined) {
      const headline = body.headline === null ? null : String(body.headline).trim();
      if (headline && headline.length > 300) {
        throw new BadRequestException('headline must not exceed 300 characters.');
      }
      updateData.headline = headline;
    }

    if (body.bio !== undefined) {
      const bio = body.bio === null ? null : String(body.bio).trim();
      if (bio && bio.length > 10000) {
        throw new BadRequestException('bio must not exceed 10000 characters.');
      }
      updateData.bio = bio;
    }

    const rawTargetCareer =
      body.targetCareer !== undefined ? body.targetCareer : body.desiredRole;
    if (rawTargetCareer !== undefined) {
      const targetCareer =
        rawTargetCareer === null ? null : String(rawTargetCareer).trim();
      if (targetCareer && targetCareer.length > 200) {
        throw new BadRequestException('targetCareer must not exceed 200 characters.');
      }
      updateData.targetCareer = targetCareer;
    }

    if (body.avatarUrl !== undefined) {
      const avatarUrl = body.avatarUrl === null ? null : String(body.avatarUrl).trim();
      if (avatarUrl && avatarUrl.length > 2000000) {
        throw new BadRequestException('avatarUrl exceeds maximum length.');
      }
      updateData.avatarUrl = avatarUrl;
    }

    if (body.githubUsername !== undefined && body.githubUsername !== null && body.githubUsername !== '') {
      const cleaned = String(body.githubUsername).trim().replace(/^@/, '');
      if (!/^[a-zA-Z0-9-]{1,39}$/.test(cleaned)) {
        throw new BadRequestException('Invalid githubUsername format.');
      }
      if (
        profile.githubUsername &&
        profile.githubUsername.toLowerCase() !== cleaned.toLowerCase()
      ) {
        throw new ForbiddenException(
          'Cannot change githubUsername to a different account once bound.',
        );
      }

      const duplicate = await this.prisma.candidateProfile.findFirst({
        where: {
          githubUsername: { equals: cleaned, mode: 'insensitive' },
          id: { not: profile.id },
        },
      });
      if (duplicate) {
        throw new ForbiddenException('githubUsername is already bound to another candidate.');
      }

      updateData.githubUsername = cleaned;
      if (!profile.githubConnectedAt) {
        updateData.githubConnectedAt = new Date();
      }
    }

    if (body.education !== undefined) {
      if (typeof body.education === 'string') {
        const trimmed = body.education.trim();
        if (trimmed.length > 2000) {
          throw new BadRequestException('education string must not exceed 2000 characters.');
        }
        updateData.education = trimmed ? [{ degree: trimmed }] : [];
      } else if (Array.isArray(body.education) && body.education.length <= 50) {
        updateData.education = body.education;
      } else {
        throw new BadRequestException('education must be an array of at most 50 items.');
      }
    }

    if (body.experience !== undefined) {
      if (!Array.isArray(body.experience) || body.experience.length > 50) {
        throw new BadRequestException('experience must be an array of at most 50 items.');
      }
      updateData.experience = body.experience;
    } else if (
      body.experienceYears !== undefined ||
      body.location !== undefined ||
      body.phone !== undefined ||
      body.portfolioUrl !== undefined ||
      body.isPublic !== undefined
    ) {
      const prevExp = Array.isArray(profile.experience)
        ? [...(profile.experience as any[])]
        : [];
      const firstObj =
        prevExp[0] && typeof prevExp[0] === 'object' ? { ...prevExp[0] } : {};
      if (body.experienceYears !== undefined) {
        firstObj.years = Math.max(0, Math.min(50, Number(body.experienceYears) || 0));
      }
      if (body.location !== undefined) {
        firstObj.location = String(body.location || '').trim().slice(0, 200);
      }
      if (body.phone !== undefined) {
        firstObj.phone = String(body.phone || '').trim().slice(0, 50);
      }
      if (body.portfolioUrl !== undefined) {
        firstObj.portfolioUrl = String(body.portfolioUrl || '').trim().slice(0, 500);
      }
      if (body.isPublic !== undefined) {
        firstObj.isPublic = Boolean(body.isPublic);
      }
      prevExp[0] = firstObj;
      updateData.experience = prevExp;
    }

    const combinedJsonLength =
      JSON.stringify(updateData.education ?? profile.education ?? []).length +
      JSON.stringify(updateData.experience ?? profile.experience ?? []).length;

    if (combinedJsonLength > 200000) {
      throw new BadRequestException(
        'Combined education and experience payload exceeds 200000 characters.',
      );
    }

    await this.prisma.candidateProfile.update({
      where: { id: profile.id },
      data: updateData,
    });

    return this.getProfile(userId);
  }

  async getRadar(userId: string) {
    const profile = await this.getOrCreateProfile(userId);
    const [assessedMap, allSkills, githubCandidateSkills] = await Promise.all([
      this.getCandidateAssessedSkillsMap(profile.id),
      this.prisma.skill.findMany({
        select: { id: true, name: true, category: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.candidateSkill.findMany({
        where: {
          candidateId: profile.id,
          evidences: { some: {} },
        },
        include: {
          skill: { select: { id: true, name: true, category: true } },
        },
      }),
    ]);

    const totalByCategory: Record<string, number> = {};
    for (const sk of allSkills) {
      totalByCategory[sk.category] = (totalByCategory[sk.category] || 0) + 1;
    }

    const githubNamesByCategory: Record<string, string[]> = {};
    for (const cs of githubCandidateSkills) {
      const cat = cs.skill?.category;
      const name = cs.skill?.name;
      if (!cat || !name) continue;
      if (!githubNamesByCategory[cat]) {
        githubNamesByCategory[cat] = [];
      }
      if (!githubNamesByCategory[cat].includes(name)) {
        githubNamesByCategory[cat].push(name);
      }
    }

    const scoresByCategory: Record<string, number[]> = {};
    for (const item of assessedMap.values()) {
      const cat = item.category || 'BACKEND';
      if (!scoresByCategory[cat]) {
        scoresByCategory[cat] = [];
      }
      scoresByCategory[cat].push(item.score);
    }

    return RADAR_CATEGORIES.map((rc) => {
      const list = scoresByCategory[rc.category] || [];
      const avg =
        list.length > 0
          ? Math.round(list.reduce((sum, v) => sum + v, 0) / list.length)
          : null;
      const totalSkillsInCategory = totalByCategory[rc.category] || 0;
      const githubSkillNames = (githubNamesByCategory[rc.category] || []).sort((a, b) =>
        a.localeCompare(b),
      );
      const githubCount = githubSkillNames.length;
      const githubCoveragePct =
        totalSkillsInCategory > 0
          ? Math.min(100, Math.round((githubCount / totalSkillsInCategory) * 100))
          : 0;

      return {
        category: rc.category,
        subject: rc.subject,
        label: rc.subject,
        fullMark: 100,
        score: avg, // Strictly null when no eligible practical assessment exists in this category
        averageScore: avg,
        status: avg !== null ? 'ASSESSED' : 'NOT_ASSESSED',
        assessedCount: list.length,
        totalSkillsInCategory,
        githubCount,
        githubCoveragePct,
        githubSkillNames,
      };
    });
  }

  async getSkillsSummary(userId: string) {
    const baseProfile = await this.getOrCreateProfile(userId);
    const [profile, radar, assessedMap, allSkills] = await Promise.all([
      this.prisma.candidateProfile.findUnique({
        where: { id: baseProfile.id },
        include: {
          skills: {
            include: {
              skill: true,
              evidences: { include: { repository: true } },
            },
          },
          githubRepos: true,
        },
      }),
      this.getRadar(userId),
      this.getCandidateAssessedSkillsMap(baseProfile.id),
      this.prisma.skill.findMany({
        orderBy: [{ category: 'asc' }, { name: 'asc' }],
      }),
    ]);

    const candidateSkillBySkillId = new Map(
      (profile?.skills || []).map((cs) => [cs.skillId, cs]),
    );

    const skills = allSkills.map((sk) => {
      const assessed = assessedMap.get(sk.id) || null;
      const cs = candidateSkillBySkillId.get(sk.id) || null;
      const evidences = cs?.evidences || [];
      const hasGithubEvidence = evidences.length > 0;

      const status = assessed
        ? assessed.score >= 60
          ? 'ASSESSED'
          : 'GAP'
        : 'NOT_ASSESSED';

      const level = assessed
        ? assessed.score >= 85
          ? 'ADVANCED'
          : assessed.score >= 60
            ? 'INTERMEDIATE'
            : 'BEGINNER'
        : null;

      return {
        skillId: sk.id,
        skillName: sk.name,
        name: sk.name,
        slug: sk.slug,
        category: sk.category,
        status,
        assessedScore: assessed ? assessed.score : null,
        assessmentScore: assessed ? assessed.score : null,
        level,
        hasGithubEvidence,
        githubRepoCount: evidences.length,
        githubRepoNames: evidences
          .map((e) => e.repository?.repoName || e.repository?.fullName)
          .filter(Boolean),
      };
    });

    return {
      radar,
      skills,
    };
  }

  async getApplications(userId: string) {
    const profile = await this.getOrCreateProfile(userId);
    return this.prisma.jobApplication.findMany({
      where: { candidateId: profile.id },
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
}
