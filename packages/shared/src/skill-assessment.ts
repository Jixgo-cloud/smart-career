import { readAttemptPercentage, AttemptScoreInput } from './assessment-score';
import { AttemptCriteriaSnapshot } from './assessment-validation';

export interface EligibleAttemptCandidate extends AttemptScoreInput {
  id: string;
  assessmentId: string;
  startedAt?: Date | string | null;
  completedAt?: Date | string | null;
  snapshot?: AttemptCriteriaSnapshot | Record<string, any> | null;
  assessment?: {
    id?: string;
    companyId?: string | null;
    title?: string;
    type?: string;
    skillId?: string | null;
    passingScore?: number;
    skill?: {
      id: string;
      name: string;
      slug?: string;
      category?: string;
    } | null;
  } | null;
}

export interface AssessedSkillRecord {
  skillId: string;
  skillName: string;
  category: string;
  score: number;
  passingScore: number;
  passed: boolean;
  status: 'ASSESSED' | 'GAP';
  attemptId: string;
  assessmentId: string;
  completedAt: string;
  criteriaHash: string;
  qualityStatus: 'PENDING_EXPERT_REVIEW_AND_PILOT';
}

/**
 * Checks whether an attempt satisfies all 6 rules from Section 8.1 to serve as a global skill proficiency score.
 */
export function isAttemptEligibleForGlobalSkill(attempt: EligibleAttemptCandidate): {
  eligible: boolean;
  skillId?: string;
  skillName?: string;
  category?: string;
  passingScore?: number;
  score?: number;
  criteriaHash?: string;
} {
  // 1. Attempt is COMPLETED
  if (attempt.status !== 'COMPLETED') {
    return { eligible: false };
  }

  // 2. Assessment has no companyId and snapshot has gradingMode = PLATFORM_AUTOMATED
  if (attempt.assessment?.companyId) {
    return { eligible: false };
  }

  const snap = attempt.snapshot as Record<string, any> | null | undefined;
  if (!snap || snap.gradingMode !== 'PLATFORM_AUTOMATED') {
    return { eligible: false };
  }

  // 3. Snapshot has skillAssessmentVersion=1, assessmentType=PRACTICAL_CODING, skill.id, criteriaHash, and questions[]
  if (
    snap.skillAssessmentVersion !== 1 ||
    snap.assessmentType !== 'PRACTICAL_CODING' ||
    !snap.skill?.id ||
    typeof snap.criteriaHash !== 'string' ||
    !snap.criteriaHash.trim() ||
    !Array.isArray(snap.questions) ||
    snap.questions.length === 0
  ) {
    return { eligible: false };
  }

  // 4. passingScore is a number > 0 and <= 100
  const passingScore = Number(snap.passingScore);
  if (!Number.isFinite(passingScore) || passingScore <= 0 || passingScore > 100) {
    return { eligible: false };
  }

  // 5. All questions are AUTOMATED_TEST_CASES with testCaseCount > 0, OR attempt passed HUMAN_REVIEWED
  const allAutomated = snap.questions.every(
    (q: any) =>
      q &&
      q.evaluationMethod === 'AUTOMATED_TEST_CASES' &&
      typeof q.testCaseCount === 'number' &&
      q.testCaseCount > 0,
  );
  const isHumanReviewed = attempt.reviewStatus === 'HUMAN_REVIEWED';
  if (!allAutomated && !isHumanReviewed) {
    return { eligible: false };
  }

  // 6. Readable final percentage score (not in pending/failed state)
  const score = readAttemptPercentage(attempt);
  if (score === null) {
    return { eligible: false };
  }

  return {
    eligible: true,
    skillId: String(snap.skill.id),
    skillName: String(snap.skill.name || attempt.assessment?.skill?.name || 'Unknown'),
    category: String(snap.skill.category || attempt.assessment?.skill?.category || 'BACKEND'),
    passingScore,
    score,
    criteriaHash: String(snap.criteriaHash),
  };
}

function toTimestamp(val?: Date | string | null): number {
  if (!val) return 0;
  const t = new Date(val).getTime();
  return Number.isFinite(t) ? t : 0;
}

/**
 * Selects the LATEST eligible attempt per skillId (by completedAt ?? startedAt, tie-broken by id).
 * Never picks highest score from cache.
 */
export function assessedSkills(
  attempts: EligibleAttemptCandidate[],
): Map<string, AssessedSkillRecord> {
  const sorted = [...(attempts || [])].sort((a, b) => {
    const timeA = toTimestamp(a.completedAt ?? a.startedAt);
    const timeB = toTimestamp(b.completedAt ?? b.startedAt);
    if (timeB !== timeA) {
      return timeB - timeA;
    }
    return String(b.id).localeCompare(String(a.id));
  });

  const result = new Map<string, AssessedSkillRecord>();

  for (const attempt of sorted) {
    const check = isAttemptEligibleForGlobalSkill(attempt);
    if (!check.eligible || !check.skillId || check.score === undefined || !check.passingScore) {
      continue;
    }
    if (result.has(check.skillId)) {
      continue;
    }

    const completedIso = attempt.completedAt
      ? new Date(attempt.completedAt).toISOString()
      : attempt.startedAt
        ? new Date(attempt.startedAt).toISOString()
        : new Date().toISOString();

    result.set(check.skillId, {
      skillId: check.skillId,
      skillName: check.skillName!,
      category: check.category!,
      score: check.score,
      passingScore: check.passingScore,
      passed: check.score >= check.passingScore,
      status: check.score >= check.passingScore ? 'ASSESSED' : 'GAP',
      attemptId: attempt.id,
      assessmentId: attempt.assessmentId,
      completedAt: completedIso,
      criteriaHash: check.criteriaHash!,
      qualityStatus: 'PENDING_EXPERT_REVIEW_AND_PILOT',
    });
  }

  return result;
}

export interface JobSkillCriterionInput {
  skillId: string;
  skillName?: string;
  isRequired: boolean;
  minimumScore: number;
  weight?: number;
  skill?: {
    id: string;
    name: string;
    category?: string;
  };
}

export interface MatchedSkillItem {
  skillId: string;
  name: string;
  isRequired: boolean;
  requiredScore: number;
  userScore: number;
  credit: number;
  attemptId: string;
  status: 'ASSESSED';
}

export interface MissingSkillItem {
  skillId: string;
  name: string;
  isRequired: boolean;
  requiredScore: number;
  userScore: number;
  gap: number;
  credit: number;
  attemptId: string;
  status: 'GAP';
}

export interface UnassessedSkillItem {
  skillId: string;
  name: string;
  isRequired: boolean;
  requiredScore: number | null;
  userScore: null;
  status: 'NOT_ASSESSED';
  reason: 'NO_ELIGIBLE_RESULT' | 'INVALID_JOB_CRITERION';
}

export interface JobMatchAssessment {
  policyVersion: 1;
  jobId: string;
  matchScore: number | null;
  status: 'AWAITING_ASSESSMENT' | 'PRELIMINARY' | 'ASSESSED';
  scoreSource: 'ASSESSMENT';
  assessedCount: number;
  totalSkills: number;
  assessmentCoverage: number;
  requiredCoverage: number | null;
  preferredCoverage: number | null;
  careerAlignment: null;
  matchedSkills: MatchedSkillItem[];
  missingSkills: MissingSkillItem[];
  unassessedSkills: UnassessedSkillItem[];
}

/**
 * Computes job match score and coverage according to Section 8.2.
 * Formula:
 *   credit = min(1, assessmentScore / minimumScore) * 100
 *   R = avg credit of assessed required skills
 *   P = avg credit of assessed preferred skills
 *   matchScore = round((0.7 * R + 0.2 * P) / sum_of_active_group_weights)
 *   assessmentCoverage = round(assessedCount / totalSkills * 100)
 */
export function assessmentMatch(
  jobId: string,
  jobSkills: JobSkillCriterionInput[],
  assessedMap: Map<string, AssessedSkillRecord>,
): JobMatchAssessment {
  const skills = Array.isArray(jobSkills) ? jobSkills : [];
  const totalSkills = skills.length;

  const matchedSkills: MatchedSkillItem[] = [];
  const missingSkills: MissingSkillItem[] = [];
  const unassessedSkills: UnassessedSkillItem[] = [];

  const requiredCredits: number[] = [];
  const preferredCredits: number[] = [];

  for (const js of skills) {
    const skillName = js.skillName || js.skill?.name || 'Unknown Skill';
    const minScore = Number(js.minimumScore);
    const isRequired = js.isRequired !== false;

    if (!Number.isFinite(minScore) || minScore <= 0 || minScore > 100) {
      unassessedSkills.push({
        skillId: js.skillId,
        name: skillName,
        isRequired,
        requiredScore: Number.isFinite(minScore) ? minScore : null,
        userScore: null,
        status: 'NOT_ASSESSED',
        reason: 'INVALID_JOB_CRITERION',
      });
      continue;
    }

    const assessed = assessedMap.get(js.skillId);
    if (!assessed) {
      unassessedSkills.push({
        skillId: js.skillId,
        name: skillName,
        isRequired,
        requiredScore: minScore,
        userScore: null,
        status: 'NOT_ASSESSED',
        reason: 'NO_ELIGIBLE_RESULT',
      });
      continue;
    }

    const userScore = assessed.score;
    const credit = Math.min(1, userScore / minScore) * 100;
    const roundedCredit = Math.round(credit * 10) / 10;

    if (isRequired) {
      requiredCredits.push(credit);
    } else {
      preferredCredits.push(credit);
    }

    if (userScore >= minScore) {
      matchedSkills.push({
        skillId: js.skillId,
        name: skillName,
        isRequired,
        requiredScore: minScore,
        userScore,
        credit: roundedCredit,
        attemptId: assessed.attemptId,
        status: 'ASSESSED',
      });
    } else {
      missingSkills.push({
        skillId: js.skillId,
        name: skillName,
        isRequired,
        requiredScore: minScore,
        userScore,
        gap: Math.round((minScore - userScore) * 10) / 10,
        credit: roundedCredit,
        attemptId: assessed.attemptId,
        status: 'GAP',
      });
    }
  }

  const assessedCount = matchedSkills.length + missingSkills.length;

  if (totalSkills === 0 || assessedCount === 0) {
    return {
      policyVersion: 1,
      jobId,
      matchScore: null,
      status: 'AWAITING_ASSESSMENT',
      scoreSource: 'ASSESSMENT',
      assessedCount: 0,
      totalSkills,
      assessmentCoverage: 0,
      requiredCoverage: null,
      preferredCoverage: null,
      careerAlignment: null,
      matchedSkills,
      missingSkills,
      unassessedSkills,
    };
  }

  const hasR = requiredCredits.length > 0;
  const hasP = preferredCredits.length > 0;

  const R = hasR
    ? requiredCredits.reduce((acc, v) => acc + v, 0) / requiredCredits.length
    : null;
  const P = hasP
    ? preferredCredits.reduce((acc, v) => acc + v, 0) / preferredCredits.length
    : null;

  const weightR = hasR ? 0.7 : 0;
  const weightP = hasP ? 0.2 : 0;
  const activeWeightSum = weightR + weightP;

  const weightedSum = (hasR && R !== null ? 0.7 * R : 0) + (hasP && P !== null ? 0.2 * P : 0);
  const matchScore = activeWeightSum > 0 ? Math.round(weightedSum / activeWeightSum) : null;
  const assessmentCoverage = Math.round((assessedCount / totalSkills) * 100);
  const status = assessedCount === totalSkills ? 'ASSESSED' : 'PRELIMINARY';

  return {
    policyVersion: 1,
    jobId,
    matchScore,
    status,
    scoreSource: 'ASSESSMENT',
    assessedCount,
    totalSkills,
    assessmentCoverage,
    requiredCoverage: R !== null ? Math.round(R) : null,
    preferredCoverage: P !== null ? Math.round(P) : null,
    careerAlignment: null,
    matchedSkills,
    missingSkills,
    unassessedSkills,
  };
}

export const CAREER_DEFINITIONS: Record<
  string,
  { key: string; label: string; labelTh: string; keywords: string[]; categories: string[] }
> = {
  FULL_STACK: {
    key: 'FULL_STACK',
    label: 'Full Stack Developer',
    labelTh: 'นักพัฒนา Full Stack',
    keywords: ['full stack', 'fullstack', 'full-stack', 'software engineer', 'web developer', 'node', 'react', 'next'],
    categories: ['FRONTEND', 'BACKEND', 'DATABASE'],
  },
  FRONTEND: {
    key: 'FRONTEND',
    label: 'Frontend Developer',
    labelTh: 'นักพัฒนา Frontend',
    keywords: ['frontend', 'front-end', 'front end', 'react', 'vue', 'angular', 'ui', 'web', 'javascript', 'typescript'],
    categories: ['FRONTEND'],
  },
  BACKEND: {
    key: 'BACKEND',
    label: 'Backend Developer',
    labelTh: 'นักพัฒนา Backend',
    keywords: ['backend', 'back-end', 'back end', 'api', 'node', 'nestjs', 'java', 'go', 'python', 'sql'],
    categories: ['BACKEND', 'DATABASE'],
  },
  DATABASE: {
    key: 'DATABASE',
    label: 'Database Engineer / DBA',
    labelTh: 'วิศวกรฐานข้อมูล (Database / DBA)',
    keywords: ['database', 'dba', 'sql', 'postgresql', 'postgres', 'mysql', 'mongodb', 'redis', 'data'],
    categories: ['DATABASE'],
  },
  DEVOPS: {
    key: 'DEVOPS',
    label: 'DevOps / Cloud Engineer',
    labelTh: 'วิศวกร DevOps / Cloud',
    keywords: ['devops', 'cloud', 'sre', 'infrastructure', 'docker', 'kubernetes', 'aws', 'azure', 'ci/cd'],
    categories: ['DEVOPS', 'SECURITY'],
  },
  DATA_AI: {
    key: 'DATA_AI',
    label: 'Data / AI Engineer',
    labelTh: 'วิศวกรข้อมูลและ AI',
    keywords: ['data', 'ai', 'machine learning', 'ml', 'analytics', 'python', 'sql', 'etl', 'data engineer'],
    categories: ['AI_ML', 'DATABASE', 'BACKEND'],
  },
  MOBILE: {
    key: 'MOBILE',
    label: 'Mobile Developer',
    labelTh: 'นักพัฒนาแอปมือถือ',
    keywords: ['mobile', 'ios', 'android', 'flutter', 'react native', 'kotlin', 'swift'],
    categories: ['MOBILE', 'FRONTEND'],
  },
  TESTING: {
    key: 'TESTING',
    label: 'QA / Test Engineer',
    labelTh: 'วิศวกรทดสอบซอฟต์แวร์ (QA)',
    keywords: ['qa', 'quality assurance', 'test', 'tester', 'automation', 'cypress', 'playwright', 'selenium'],
    categories: ['TESTING'],
  },
  SECURITY: {
    key: 'SECURITY',
    label: 'Security Engineer',
    labelTh: 'วิศวกรความปลอดภัยไซเบอร์',
    keywords: ['security', 'cybersecurity', 'infosec', 'pentest', 'appsec', 'devsecops', 'soc'],
    categories: ['SECURITY', 'DEVOPS'],
  },
};

export function resolveCareerDefinition(careerInput?: string | null) {
  if (!careerInput) return null;
  const trimmed = careerInput.trim();
  if (!trimmed) return null;
  const upper = trimmed.toUpperCase();
  if (CAREER_DEFINITIONS[upper]) {
    return CAREER_DEFINITIONS[upper];
  }
  const lower = trimmed.toLowerCase();
  for (const def of Object.values(CAREER_DEFINITIONS)) {
    if (
      def.label.toLowerCase() === lower ||
      def.labelTh.toLowerCase() === lower ||
      def.keywords.some((kw) => lower.includes(kw))
    ) {
      return def;
    }
  }
  return null;
}
