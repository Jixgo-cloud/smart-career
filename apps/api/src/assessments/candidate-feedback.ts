import { evaluateFrameworkCoverage, readAttemptPercentage, TestCaseItem } from '@smartcareer/shared';

/**
 * Sanitizes an assessment before a candidate starts or views it.
 * Strictly strips solutionCode, explanation (Section 16 fix), isCorrect on choices,
 * and hidden test case inputs/expectedOutputs.
 */
export function sanitizeAssessmentForCandidate(
  assessment: any,
  canStartAttempt = true,
) {
  const frameworkCoverage =
    assessment.frameworkCode
      ? evaluateFrameworkCoverage({
          frameworkCode: assessment.frameworkCode,
          frameworkVersion: assessment.frameworkVersion,
          frameworkScope: assessment.frameworkScope,
          questions: assessment.questions || [],
        })
      : null;

  const questions = (assessment.questions || []).map((q: any) => {
    const allTestCases: TestCaseItem[] = Array.isArray(q.testCases) ? q.testCases : [];
    const visibleTestCases = allTestCases
      .filter((tc) => !tc.isHidden)
      .map((tc) => ({
        input: tc.input,
        expectedOutput: tc.expectedOutput,
        isHidden: false,
      }));
    const hiddenTestCaseCount = allTestCases.filter((tc) => Boolean(tc.isHidden)).length;

    const choices = Array.isArray(q.choices)
      ? q.choices
          .slice()
          .sort((a: any, b: any) => (a.order ?? 0) - (b.order ?? 0))
          .map((c: any) => ({
            id: c.id,
            questionId: c.questionId,
            text: c.text,
            order: c.order ?? 0,
            // Never expose c.isCorrect!
          }))
      : [];

    return {
      id: q.id,
      assessmentId: q.assessmentId,
      title: q.title,
      prompt: q.prompt,
      difficulty: q.difficulty,
      points: q.points,
      starterCode: q.starterCode ?? null,
      evaluationMethod: q.evaluationMethod,
      visibleTestCases,
      testCases: visibleTestCases,
      hiddenTestCaseCount,
      totalTestCaseCount: allTestCases.length,
      choices,
      // Explicitly omit solutionCode and explanation before policy allows
    };
  });

  return {
    id: assessment.id,
    companyId: assessment.companyId ?? null,
    title: assessment.title,
    slug: assessment.slug,
    description: assessment.description,
    type: assessment.type,
    skillId: assessment.skillId,
    skill: assessment.skill || null,
    version: assessment.version,
    timeLimitMinutes: assessment.timeLimitMinutes,
    passingScore: assessment.passingScore,
    feedbackVisibility: assessment.feedbackVisibility,
    frameworkCode: assessment.frameworkCode ?? null,
    frameworkVersion: assessment.frameworkVersion ?? null,
    frameworkScope: assessment.frameworkScope ?? null,
    frameworkCoverage,
    isActive: assessment.isActive,
    canStartAttempt,
    questions,
  };
}

/**
 * Enforces server-side feedbackVisibility (IMMEDIATE, AFTER_REVIEW, PRIVATE_TO_COMPANY)
 * and removes internal criteria snapshot from candidate responses.
 */
export function formatAttemptForCandidate(attempt: any) {
  const visibility =
    attempt.assessment?.feedbackVisibility ||
    (attempt.snapshot as any)?.feedbackVisibility ||
    'IMMEDIATE';

  const reviewStatus = attempt.reviewStatus || 'NOT_REQUIRED';
  const status = attempt.status || 'IN_PROGRESS';

  const isPendingReview =
    reviewStatus === 'PENDING_HUMAN_REVIEW' ||
    reviewStatus === 'EVALUATION_PENDING' ||
    reviewStatus === 'EVALUATION_FAILED';

  const hideFeedback =
    status !== 'COMPLETED' ||
    visibility === 'PRIVATE_TO_COMPANY' ||
    (visibility === 'AFTER_REVIEW' && reviewStatus !== 'HUMAN_REVIEWED') ||
    isPendingReview;

  const effectivePercentage = hideFeedback ? null : readAttemptPercentage(attempt);

  const sanitizedAnswers = Array.isArray(attempt.answers)
    ? attempt.answers.map((ans: any) => {
        if (hideFeedback) {
          return {
            id: ans.id,
            questionId: ans.questionId,
            selectedChoiceId: ans.selectedChoiceId ?? null,
            submittedCode: ans.submittedCode ?? null,
            isCorrect: null,
            pointsEarned: null,
            executionResult: null,
          };
        }

        // Even when feedback is visible, sanitize hidden test case inputs/expectedOutputs from executionResult
        let safeExecResult = ans.executionResult ?? null;
        if (safeExecResult && Array.isArray(safeExecResult.results)) {
          safeExecResult = {
            ...safeExecResult,
            results: safeExecResult.results.map((r: any) =>
              r.isHidden
                ? {
                    caseIndex: r.caseIndex,
                    isHidden: true,
                    passed: r.passed,
                    statusDescription: r.statusDescription,
                  }
                : r,
            ),
          };
        }

        return {
          id: ans.id,
          questionId: ans.questionId,
          selectedChoiceId: ans.selectedChoiceId ?? null,
          submittedCode: ans.submittedCode ?? null,
          isCorrect: ans.isCorrect,
          pointsEarned: ans.pointsEarned,
          executionResult: safeExecResult,
        };
      })
    : undefined;

  return {
    id: attempt.id,
    assessmentId: attempt.assessmentId,
    candidateId: attempt.candidateId,
    status: attempt.status,
    assessmentVersion: attempt.assessmentVersion,
    reviewStatus: attempt.reviewStatus,
    feedbackVisibility: visibility,
    feedbackHidden: hideFeedback,
    score: hideFeedback ? null : attempt.score,
    maxScore: attempt.maxScore,
    percentage: effectivePercentage,
    passed: hideFeedback
      ? null
      : effectivePercentage !== null
        ? effectivePercentage >= (attempt.assessment?.passingScore ?? 70)
        : attempt.passed,
    aiScore: hideFeedback ? null : attempt.aiScore,
    humanScore: hideFeedback ? null : attempt.humanScore,
    finalScore: hideFeedback ? null : attempt.finalScore,
    reviewedAt: hideFeedback ? null : attempt.reviewedAt,
    reviewReason: hideFeedback ? null : attempt.reviewReason,
    evaluationSnapshot: hideFeedback ? null : attempt.evaluationSnapshot,
    draftCode: attempt.draftCode ?? null,
    timeSpentSeconds: attempt.timeSpentSeconds,
    startedAt: attempt.startedAt,
    completedAt: attempt.completedAt,
    // snapshot is intentionally omitted from candidate response
    assessment: attempt.assessment
      ? {
          id: attempt.assessment.id,
          companyId: attempt.assessment.companyId ?? null,
          title: attempt.assessment.title,
          slug: attempt.assessment.slug,
          type: attempt.assessment.type,
          skillId: attempt.assessment.skillId,
          skill: attempt.assessment.skill || null,
          timeLimitMinutes: attempt.assessment.timeLimitMinutes,
          passingScore: attempt.assessment.passingScore,
          feedbackVisibility: attempt.assessment.feedbackVisibility,
        }
      : undefined,
    answers: sanitizedAnswers,
  };
}
