export interface AttemptScoreInput {
  status?: string | null;
  reviewStatus?: string | null;
  score?: number | null;
  maxScore?: number | null;
  percentage?: number | null;
  aiScore?: number | null;
  humanScore?: number | null;
  finalScore?: number | null;
}

/**
 * Reads the effective percentage score (0-100) from an assessment attempt.
 * Order: humanScore -> finalScore -> percentage -> (score / maxScore) * 100
 * Returns null if the attempt is not completed, pending evaluation/review, or failed evaluation without human override.
 */
export function readAttemptPercentage(attempt: AttemptScoreInput | null | undefined): number | null {
  if (!attempt) return null;

  const status = attempt.status ?? 'IN_PROGRESS';
  if (status !== 'COMPLETED') {
    return null;
  }

  const reviewStatus = attempt.reviewStatus ?? 'NOT_REQUIRED';

  // If human reviewed, humanScore takes precedence
  if (
    reviewStatus === 'HUMAN_REVIEWED' &&
    typeof attempt.humanScore === 'number' &&
    Number.isFinite(attempt.humanScore)
  ) {
    return clampPercentage(attempt.humanScore);
  }

  // Pending or failed states without human review cannot yield a measurable score
  if (
    reviewStatus === 'PENDING_HUMAN_REVIEW' ||
    reviewStatus === 'EVALUATION_PENDING' ||
    reviewStatus === 'EVALUATION_FAILED'
  ) {
    return null;
  }

  if (typeof attempt.humanScore === 'number' && Number.isFinite(attempt.humanScore)) {
    return clampPercentage(attempt.humanScore);
  }

  if (typeof attempt.finalScore === 'number' && Number.isFinite(attempt.finalScore)) {
    return clampPercentage(attempt.finalScore);
  }

  if (typeof attempt.percentage === 'number' && Number.isFinite(attempt.percentage)) {
    return clampPercentage(attempt.percentage);
  }

  if (
    typeof attempt.score === 'number' &&
    Number.isFinite(attempt.score) &&
    typeof attempt.maxScore === 'number' &&
    Number.isFinite(attempt.maxScore) &&
    attempt.maxScore > 0
  ) {
    return clampPercentage((attempt.score / attempt.maxScore) * 100);
  }

  return null;
}

export function clampPercentage(value: number): number {
  const clamped = Math.max(0, Math.min(100, value));
  return Math.round(clamped * 10) / 10;
}
