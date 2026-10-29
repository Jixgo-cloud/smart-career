import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  assessedSkills,
  AssessedSkillRecord,
  JobMatchAssessment,
} from '@smartcareer/shared';

export interface CandidateSkillEvidenceRecord {
  skillId: string;
  skillName: string;
  hasGithubEvidence: boolean;
  githubRepoCount: number;
  githubRepoNames: string[];
  examScore: number | null;
  assessedAt: string | null;
}

@Injectable()
export class MatchingService {
  constructor(private readonly prisma: PrismaService) {}

  async getCandidateAssessedSkillsMap(
    candidateId: string,
  ): Promise<Map<string, AssessedSkillRecord>> {
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

  async getCandidateSkillEvidenceMap(
    candidateId: string,
  ): Promise<Map<string, CandidateSkillEvidenceRecord>> {
    const [assessedMap, githubCandidateSkills] = await Promise.all([
      this.getCandidateAssessedSkillsMap(candidateId),
      this.prisma.candidateSkill.findMany({
        where: {
          candidateId,
          evidences: { some: {} },
        },
        include: {
          skill: true,
          evidences: {
            include: { repository: true },
          },
        },
      }),
    ]);

    const evidenceMap = new Map<string, CandidateSkillEvidenceRecord>();

    for (const cs of githubCandidateSkills) {
      const repoNames = Array.from(
        new Set(
          (cs.evidences || [])
            .map((ev) => ev.repository?.repoName || ev.repository?.fullName)
            .filter((n): n is string => Boolean(n)),
        ),
      );
      const assessed = assessedMap.get(cs.skillId);
      evidenceMap.set(cs.skillId, {
        skillId: cs.skillId,
        skillName: cs.skill?.name || assessed?.skillName || 'Skill',
        hasGithubEvidence: true,
        githubRepoCount: Math.max(repoNames.length, cs.evidences?.length || 1),
        githubRepoNames: repoNames,
        examScore: assessed ? assessed.score : null,
        assessedAt: assessed ? assessed.completedAt : null,
      });
    }

    for (const [skillId, assessed] of assessedMap.entries()) {
      if (!evidenceMap.has(skillId)) {
        evidenceMap.set(skillId, {
          skillId,
          skillName: assessed.skillName || 'Skill',
          hasGithubEvidence: false,
          githubRepoCount: 0,
          githubRepoNames: [],
          examScore: assessed.score,
          assessedAt: assessed.completedAt,
        });
      }
    }

    return evidenceMap;
  }

  computeMatchForJobObject(
    job: {
      id: string;
      skills?: Array<{
        skillId: string;
        isRequired: boolean;
        minimumScore: number;
        weight?: number;
        skill?: { id: string; name: string; category?: string };
      }>;
    },
    evidenceMap: Map<string, CandidateSkillEvidenceRecord>,
  ): JobMatchAssessment {
    const criteria = (job.skills || []).map((js) => ({
      skillId: js.skillId,
      skillName: js.skill?.name || 'Skill',
      isRequired: js.isRequired !== false,
      minimumScore: js.minimumScore ?? 50,
      weight: js.weight ?? (js.isRequired !== false ? 1.0 : 0.4),
    }));

    const totalCriteria = criteria.length;
    if (totalCriteria === 0 || evidenceMap.size === 0) {
      const unassessedSkills = criteria.map((c) => ({
        skillId: c.skillId,
        skillName: c.skillName,
        name: c.skillName,
        isRequired: c.isRequired,
        minimumScore: c.minimumScore,
        requiredScore: c.minimumScore,
        candidateScore: null,
        userScore: null,
        weight: c.weight,
        reason: 'NO_ELIGIBLE_RESULT' as const,
        status: 'NOT_ASSESSED' as const,
      }));
      return {
        policyVersion: 1,
        jobId: job.id,
        status: 'AWAITING_ASSESSMENT',
        scoreSource: 'ASSESSMENT',
        matchScore: null,
        assessedCount: 0,
        totalSkills: totalCriteria,
        assessedSkillCount: 0,
        totalJobSkillCount: totalCriteria,
        assessmentCoverage: 0,
        requiredCoverage: null,
        preferredCoverage: null,
        careerAlignment: null,
        matchedSkills: [],
        missingSkills: [],
        unassessedSkills,
      } as unknown as JobMatchAssessment;
    }

    const matchedSkills: any[] = [];
    const missingSkills: any[] = [];

    let requiredTotal = 0;
    let requiredMatched = 0;
    let preferredTotal = 0;
    let preferredMatched = 0;

    for (const c of criteria) {
      if (c.isRequired) {
        requiredTotal += 1;
      } else {
        preferredTotal += 1;
      }

      const ev = evidenceMap.get(c.skillId);
      if (ev && (ev.hasGithubEvidence || ev.examScore !== null)) {
        if (c.isRequired) {
          requiredMatched += 1;
        } else {
          preferredMatched += 1;
        }

        matchedSkills.push({
          skillId: c.skillId,
          skillName: c.skillName,
          name: c.skillName,
          isRequired: c.isRequired,
          minimumScore: c.minimumScore,
          requiredScore: c.minimumScore,
          candidateScore: ev.examScore ?? 100,
          userScore: ev.examScore ?? 100,
          examScore: ev.examScore,
          hasGithubEvidence: ev.hasGithubEvidence,
          githubRepoCount: ev.githubRepoCount,
          githubRepoNames: ev.githubRepoNames,
          weight: c.weight,
          status: 'MATCHED',
        });
      } else {
        missingSkills.push({
          skillId: c.skillId,
          skillName: c.skillName,
          name: c.skillName,
          isRequired: c.isRequired,
          minimumScore: c.minimumScore,
          requiredScore: c.minimumScore,
          candidateScore: 0,
          userScore: 0,
          examScore: null,
          hasGithubEvidence: false,
          githubRepoCount: 0,
          githubRepoNames: [],
          weight: c.weight,
          status: 'GAP',
        });
      }
    }

    let rawScore = 0;
    if (requiredTotal > 0 && preferredTotal > 0) {
      const reqRatio = requiredMatched / requiredTotal;
      const prefRatio = preferredMatched / preferredTotal;
      rawScore = (reqRatio * 0.7 + prefRatio * 0.3) * 100;
    } else if (requiredTotal > 0) {
      rawScore = (requiredMatched / requiredTotal) * 100;
    } else if (preferredTotal > 0) {
      rawScore = (preferredMatched / preferredTotal) * 100;
    }

    const finalScore = Math.round(rawScore * 100) / 100;
    const coverage =
      Math.round((matchedSkills.length / totalCriteria) * 10000) / 100;

    return {
      policyVersion: 1,
      jobId: job.id,
      status: 'ASSESSED',
      scoreSource: 'ASSESSMENT',
      matchScore: finalScore,
      assessedCount: matchedSkills.length,
      totalSkills: totalCriteria,
      assessedSkillCount: matchedSkills.length,
      totalJobSkillCount: totalCriteria,
      assessmentCoverage: coverage,
      requiredCoverage:
        requiredTotal > 0 ? Math.round((requiredMatched / requiredTotal) * 100) : null,
      preferredCoverage:
        preferredTotal > 0 ? Math.round((preferredMatched / preferredTotal) * 100) : null,
      careerAlignment: null,
      matchedSkills,
      missingSkills,
      unassessedSkills: [],
    } as unknown as JobMatchAssessment;
  }

  async matchSingleJob(candidateId: string, jobId: string): Promise<JobMatchAssessment> {
    const job = await this.prisma.job.findUnique({
      where: { id: jobId },
      include: {
        skills: {
          include: { skill: true },
        },
      },
    });

    if (!job) {
      throw new NotFoundException('Job not found.');
    }

    const evidenceMap = await this.getCandidateSkillEvidenceMap(candidateId);
    return this.computeMatchForJobObject(job as any, evidenceMap);
  }

  async matchJobsBatch(
    candidateId: string,
    jobs: Array<{
      id: string;
      skills?: Array<{
        skillId: string;
        isRequired: boolean;
        minimumScore: number;
        weight?: number;
        skill?: { id: string; name: string; category?: string };
      }>;
    }>,
  ): Promise<Map<string, JobMatchAssessment>> {
    const evidenceMap = await this.getCandidateSkillEvidenceMap(candidateId);
    const out = new Map<string, JobMatchAssessment>();
    for (const job of jobs) {
      out.set(job.id, this.computeMatchForJobObject(job, evidenceMap));
    }
    return out;
  }
}
