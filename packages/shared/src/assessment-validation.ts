import * as crypto from 'crypto';
import { evaluateFrameworkCoverage, FrameworkCoverageResult } from './assessment-framework';

export interface TestCaseItem {
  input: string;
  expectedOutput: string;
  isHidden?: boolean;
}

export interface ChoiceInput {
  id?: string;
  text: string;
  isCorrect?: boolean;
  order?: number;
}

export interface QuestionValidationInput {
  id?: string;
  title?: string;
  prompt?: string;
  difficulty?: string;
  points?: number;
  starterCode?: string | null;
  testCases?: TestCaseItem[] | unknown;
  evaluationMethod?: 'AUTOMATED_TEST_CASES' | 'OPEN_ENDED' | string;
  rubric?: unknown;
  choices?: ChoiceInput[];
  frameworkTopicId?: string | null;
  frameworkMappingNote?: string | null;
}

export interface AssessmentValidationInput {
  id?: string;
  companyId?: string | null;
  title?: string;
  type?: 'THEORY' | 'PRACTICAL_CODING' | string;
  skillId?: string | null;
  skill?: {
    id: string;
    name: string;
    slug?: string;
    category?: string;
  } | null;
  version?: number;
  timeLimitMinutes?: number;
  passingScore?: number;
  feedbackVisibility?: string;
  frameworkCode?: string | null;
  frameworkVersion?: string | null;
  frameworkScope?: string | null;
  questions?: QuestionValidationInput[];
}

export interface AssessmentReadinessResult {
  isReady: boolean;
  errors: string[];
  readinessError: string | null;
  frameworkCoverage: FrameworkCoverageResult | null;
}

const PLACEHOLDER_CHOICE_PATTERNS = [
  /^option\s*[a-z0-9]$/i,
  /^choice\s*[a-z0-9]$/i,
  /^ตัวเลือก\s*[ก-ฮa-z0-9]$/i,
  /^test$/i,
  /^placeholder$/i,
];

export function validateAssessmentReadiness(
  assessment: AssessmentValidationInput,
): AssessmentReadinessResult {
  const errors: string[] = [];

  const title = assessment.title?.trim() || '';
  if (!title) {
    errors.push('Assessment title is required.');
  }

  const timeLimit = assessment.timeLimitMinutes;
  if (
    typeof timeLimit !== 'number' ||
    !Number.isInteger(timeLimit) ||
    timeLimit < 1 ||
    timeLimit > 240
  ) {
    errors.push('timeLimitMinutes must be an integer between 1 and 240.');
  }

  const passingScore = assessment.passingScore;
  if (
    typeof passingScore !== 'number' ||
    !Number.isFinite(passingScore) ||
    passingScore < 0 ||
    passingScore > 100
  ) {
    errors.push('passingScore must be between 0 and 100.');
  } else if (!assessment.companyId && assessment.type === 'PRACTICAL_CODING' && passingScore <= 0) {
    errors.push('Platform practical coding assessments must have passingScore > 0.');
  }

  const questions = Array.isArray(assessment.questions) ? assessment.questions : [];
  if (questions.length < 1) {
    errors.push('Assessment must contain at least 1 question.');
  } else if (questions.length > 100) {
    errors.push('Assessment cannot exceed 100 questions.');
  }

  questions.forEach((q, idx) => {
    const qLabel = `Question ${idx + 1}`;
    if (!q.title?.trim()) {
      errors.push(`${qLabel}: title is required.`);
    }
    if (!q.prompt?.trim()) {
      errors.push(`${qLabel}: prompt is required.`);
    }
    if (
      typeof q.points !== 'number' ||
      !Number.isInteger(q.points) ||
      q.points < 1 ||
      q.points > 10000
    ) {
      errors.push(`${qLabel}: points must be an integer between 1 and 10000.`);
    }

    if (assessment.type === 'THEORY') {
      const choices = Array.isArray(q.choices) ? q.choices : [];
      if (choices.length < 2 || choices.length > 10) {
        errors.push(`${qLabel}: THEORY question must have between 2 and 10 choices.`);
      } else {
        const seenTexts = new Set<string>();
        let correctCount = 0;
        choices.forEach((c, cIdx) => {
          const text = c.text?.trim() || '';
          if (!text) {
            errors.push(`${qLabel}, Choice ${cIdx + 1}: text cannot be empty.`);
          } else {
            const normalized = text.toLowerCase();
            if (seenTexts.has(normalized)) {
              errors.push(`${qLabel}: duplicate choice text "${text}".`);
            }
            seenTexts.add(normalized);
            if (PLACEHOLDER_CHOICE_PATTERNS.some((re) => re.test(text))) {
              errors.push(`${qLabel}: choice "${text}" looks like a placeholder.`);
            }
          }
          if (c.isCorrect) {
            correctCount += 1;
          }
        });
        if (correctCount !== 1) {
          errors.push(`${qLabel}: THEORY question must have exactly 1 correct choice (found ${correctCount}).`);
        }
      }
    } else if (assessment.type === 'PRACTICAL_CODING') {
      const evalMethod = q.evaluationMethod || 'AUTOMATED_TEST_CASES';
      if (evalMethod === 'AUTOMATED_TEST_CASES') {
        const testCases = Array.isArray(q.testCases) ? (q.testCases as TestCaseItem[]) : [];
        if (testCases.length < 2 || testCases.length > 100) {
          errors.push(
            `${qLabel}: AUTOMATED_TEST_CASES requires between 2 and 100 test cases.`,
          );
        } else {
          const visibleCount = testCases.filter((tc) => !tc.isHidden).length;
          const hiddenCount = testCases.filter((tc) => Boolean(tc.isHidden)).length;
          if (visibleCount < 1 || hiddenCount < 1) {
            errors.push(
              `${qLabel}: AUTOMATED_TEST_CASES must include at least 1 visible and 1 hidden test case.`,
            );
          }
          testCases.forEach((tc, tcIdx) => {
            if (typeof tc.input !== 'string') {
              errors.push(`${qLabel}, TestCase ${tcIdx + 1}: input must be a string.`);
            }
            if (typeof tc.expectedOutput !== 'string' || tc.expectedOutput.trim() === '') {
              errors.push(`${qLabel}, TestCase ${tcIdx + 1}: expectedOutput must be a non-empty string.`);
            }
          });
        }
      } else if (evalMethod !== 'OPEN_ENDED') {
        errors.push(`${qLabel}: invalid evaluationMethod "${evalMethod}".`);
      }
    } else {
      errors.push(`Invalid assessment type "${assessment.type}".`);
    }
  });

  let frameworkCoverage: FrameworkCoverageResult | null = null;
  if (
    assessment.frameworkCode ||
    assessment.frameworkVersion ||
    assessment.frameworkScope ||
    questions.some((q) => q.frameworkTopicId || q.frameworkMappingNote)
  ) {
    frameworkCoverage = evaluateFrameworkCoverage({
      frameworkCode: assessment.frameworkCode,
      frameworkVersion: assessment.frameworkVersion,
      frameworkScope: assessment.frameworkScope,
      questions,
    });
    if (!frameworkCoverage.isValid) {
      errors.push(...frameworkCoverage.errors);
    }
  }

  return {
    isReady: errors.length === 0,
    errors,
    readinessError: errors.length > 0 ? errors[0] : null,
    frameworkCoverage,
  };
}

export interface AttemptCriteriaSnapshotQuestion {
  id: string;
  title: string;
  difficulty: string;
  points: number;
  evaluationMethod: string;
  testCaseCount: number;
  visibleTestCaseCount: number;
  hiddenTestCaseCount: number;
  rubric: unknown;
}

export interface AttemptCriteriaSnapshot {
  skillAssessmentVersion: 1;
  assessmentId: string;
  assessmentVersion: number;
  assessmentType: string;
  gradingMode: 'PLATFORM_AUTOMATED' | 'COMPANY_MANUAL';
  passingScore: number;
  timeLimitMinutes: number;
  feedbackVisibility: string;
  skill: {
    id: string;
    name: string;
    slug?: string;
    category?: string;
  } | null;
  questions: AttemptCriteriaSnapshotQuestion[];
  criteriaHash: string;
}

export function buildAssessmentSnapshot(assessment: {
  id: string;
  companyId?: string | null;
  version?: number;
  type: string;
  passingScore: number;
  timeLimitMinutes: number;
  feedbackVisibility?: string;
  skill?: {
    id: string;
    name: string;
    slug?: string;
    category?: string;
  } | null;
  questions: Array<{
    id: string;
    title: string;
    difficulty?: string;
    points: number;
    evaluationMethod?: string;
    testCases?: unknown;
    rubric?: unknown;
  }>;
}): AttemptCriteriaSnapshot {
  const gradingMode: 'COMPANY_MANUAL' | 'PLATFORM_AUTOMATED' = assessment.companyId
    ? 'COMPANY_MANUAL'
    : 'PLATFORM_AUTOMATED';
  const snapshotQuestions: AttemptCriteriaSnapshotQuestion[] = (assessment.questions || []).map(
    (q) => {
      const tcs = Array.isArray(q.testCases) ? (q.testCases as TestCaseItem[]) : [];
      const visibleCount = tcs.filter((tc) => !tc.isHidden).length;
      const hiddenCount = tcs.filter((tc) => Boolean(tc.isHidden)).length;
      return {
        id: q.id,
        title: q.title,
        difficulty: q.difficulty || 'MEDIUM',
        points: q.points,
        evaluationMethod: q.evaluationMethod || 'AUTOMATED_TEST_CASES',
        testCaseCount: tcs.length,
        visibleTestCaseCount: visibleCount,
        hiddenTestCaseCount: hiddenCount,
        rubric: q.rubric ?? null,
      };
    },
  );

  const basePayload = {
    skillAssessmentVersion: 1 as const,
    assessmentId: assessment.id,
    assessmentVersion: assessment.version ?? 1,
    assessmentType: assessment.type,
    gradingMode,
    passingScore: assessment.passingScore,
    timeLimitMinutes: assessment.timeLimitMinutes,
    feedbackVisibility: assessment.feedbackVisibility || 'IMMEDIATE',
    skill: assessment.skill
      ? {
          id: assessment.skill.id,
          name: assessment.skill.name,
          slug: assessment.skill.slug,
          category: assessment.skill.category,
        }
      : null,
    questions: snapshotQuestions,
  };

  const criteriaHash = computeCriteriaHash(basePayload);
  return {
    ...basePayload,
    criteriaHash,
  };
}

export function computeCriteriaHash(payload: Omit<AttemptCriteriaSnapshot, 'criteriaHash'>): string {
  const canonical = JSON.stringify({
    skillAssessmentVersion: payload.skillAssessmentVersion,
    assessmentId: payload.assessmentId,
    assessmentVersion: payload.assessmentVersion,
    assessmentType: payload.assessmentType,
    gradingMode: payload.gradingMode,
    passingScore: payload.passingScore,
    skillId: payload.skill?.id ?? null,
    questions: payload.questions.map((q) => ({
      id: q.id,
      points: q.points,
      evaluationMethod: q.evaluationMethod,
      testCaseCount: q.testCaseCount,
    })),
  });
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

/**
 * Determines execution language from starterCode or explicit marker.
 * Python -> Judge0 ID 71, JavaScript -> Judge0 ID 63
 */
export function detectExecutionLanguage(starterCode?: string | null): {
  language: 'python' | 'javascript';
  judge0LanguageId: 71 | 63;
} {
  const code = starterCode || '';
  if (/^\s*def\s+solution\s*\(/m.test(code) || /^\s*#\s*language:\s*python/im.test(code)) {
    return { language: 'python', judge0LanguageId: 71 };
  }
  return { language: 'javascript', judge0LanguageId: 63 };
}
