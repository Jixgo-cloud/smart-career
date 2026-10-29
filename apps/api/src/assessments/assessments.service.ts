import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  AssessmentReviewStatus,
  AssessmentType,
  AttemptStatus,
  NotificationType,
  QuestionEvaluationMethod,
  UserRole,
} from '@prisma/client';
import {
  buildAssessmentSnapshot,
  readAttemptPercentage,
  TestCaseItem,
  validateAssessmentReadiness,
} from '@smartcareer/shared';
import { PrismaService } from '../prisma/prisma.service';
import { Judge0Client } from './judge0.client';
import { AiEvaluatorService } from './ai-evaluator.service';
import {
  formatAttemptForCandidate,
  sanitizeAssessmentForCandidate,
} from './candidate-feedback';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class AssessmentsService {
  private readonly runCodeTimestamps = new Map<string, number>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly judge0: Judge0Client,
    private readonly aiEvaluator: AiEvaluatorService,
    private readonly notifications: NotificationsService,
  ) {}

  async listPublicPlatformAssessments() {
    const all = await this.prisma.assessment.findMany({
      where: {
        companyId: null,
        isActive: true,
      },
      include: {
        skill: true,
        questions: {
          include: { choices: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Only return platform assessments that pass readiness, and strip questions/answer keys from catalog list
    return all
      .filter((a) => validateAssessmentReadiness(a as any).isReady)
      .map((a) => ({
        id: a.id,
        title: a.title,
        slug: a.slug,
        description: a.description,
        type: a.type,
        skillId: a.skillId,
        skill: a.skill,
        version: a.version,
        timeLimitMinutes: a.timeLimitMinutes,
        passingScore: a.passingScore,
        feedbackVisibility: a.feedbackVisibility,
        frameworkCode: a.frameworkCode,
        frameworkVersion: a.frameworkVersion,
        frameworkScope: a.frameworkScope,
        questionCount: a.questions.length,
        isActive: a.isActive,
      }));
  }

  private async canCandidateAccessAssessment(
    candidateId: string | null,
    assessment: { id: string; companyId: string | null; isActive: boolean },
  ): Promise<boolean> {
    if (!assessment.isActive) return false;
    if (!assessment.companyId) return true; // Platform exam
    if (!candidateId) return false;

    // Company exam requires candidate to have an application to that company with assignedAssessmentId or job.customAssessmentId
    const application = await this.prisma.jobApplication.findFirst({
      where: {
        candidateId,
        OR: [
          { assignedAssessmentId: assessment.id },
          { job: { customAssessmentId: assessment.id } },
        ],
      },
    });

    return Boolean(application);
  }

  async getAssessmentDetail(assessmentId: string, currentUser?: any) {
    const assessment = await this.prisma.assessment.findUnique({
      where: { id: assessmentId },
      include: {
        skill: true,
        questions: {
          include: { choices: true },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!assessment) {
      throw new NotFoundException('Assessment not found.');
    }

    const readiness = validateAssessmentReadiness(assessment as any);

    // If company exam, verify access
    if (assessment.companyId) {
      const isAdmin = currentUser?.role === UserRole.ADMIN;
      const isOwningCompany =
        currentUser?.role === UserRole.COMPANY &&
        (currentUser.companyMembers || []).some(
          (cm: any) => cm.companyId === assessment.companyId,
        );
      const isAssignedCandidate =
        currentUser?.role === UserRole.CANDIDATE &&
        (await this.canCandidateAccessAssessment(
          currentUser?.candidateProfile?.id || null,
          assessment,
        ));

      if (!isAdmin && !isOwningCompany && !isAssignedCandidate) {
        throw new ForbiddenException('You do not have access to this company assessment.');
      }
    }

    const canStartAttempt =
      Boolean(assessment.isActive) &&
      readiness.isReady &&
      (!currentUser ||
        currentUser.role !== UserRole.CANDIDATE ||
        (await this.canCandidateAccessAssessment(
          currentUser?.candidateProfile?.id || null,
          assessment,
        )));

    return sanitizeAssessmentForCandidate(assessment, canStartAttempt);
  }

  async getMyAttempts(user: any) {
    const candidateId = user?.candidateProfile?.id;
    if (!candidateId) {
      throw new NotFoundException('Candidate profile not found.');
    }

    const attempts = await this.prisma.assessmentAttempt.findMany({
      where: { candidateId },
      include: {
        assessment: {
          include: { skill: true },
        },
        answers: true,
      },
      orderBy: [{ startedAt: 'desc' }],
    });

    return attempts.map((att) => formatAttemptForCandidate(att));
  }

  async getMyBadges(user: any) {
    const candidateId = user?.candidateProfile?.id;
    if (!candidateId) {
      throw new NotFoundException('Candidate profile not found.');
    }

    const attempts = await this.prisma.assessmentAttempt.findMany({
      where: {
        candidateId,
        status: AttemptStatus.COMPLETED,
        passed: true,
        assessment: {
          companyId: null,
        },
      },
      include: {
        assessment: {
          include: { skill: true },
        },
      },
      orderBy: [{ completedAt: 'desc' }, { startedAt: 'desc' }],
    });

    const seenAssessmentIds = new Set<string>();
    const badges = [];

    for (const att of attempts) {
      if (seenAssessmentIds.has(att.assessmentId)) continue;
      const formatted = formatAttemptForCandidate(att);
      if (formatted.feedbackHidden || formatted.percentage === null || !formatted.passed) {
        continue;
      }

      seenAssessmentIds.add(att.assessmentId);
      badges.push({
        attemptId: att.id,
        assessmentId: att.assessmentId,
        title: att.assessment.title,
        badgeName: `SmartCareer Verified — ${att.assessment.skill?.name || att.assessment.title}`,
        badgeDisclaimer: 'Platform internal assessment badge (not an external vendor certification)',
        type: att.assessment.type,
        skillName: att.assessment.skill?.name || null,
        category: att.assessment.skill?.category || null,
        score: formatted.percentage,
        passedAt: att.completedAt || att.startedAt,
        timeSpentSeconds: att.timeSpentSeconds,
      });
    }

    return badges;
  }

  private isAttemptTimerExpired(
    startedAt: Date,
    timeLimitMinutes: number,
    graceSeconds = 30,
  ): boolean {
    const deadlineMs =
      startedAt.getTime() + timeLimitMinutes * 60 * 1000 + graceSeconds * 1000;
    return Date.now() > deadlineMs;
  }

  async startAttempt(user: any, assessmentId: string) {
    const candidateId = user?.candidateProfile?.id;
    if (!candidateId) {
      throw new NotFoundException('Candidate profile not found.');
    }

    const assessment = await this.prisma.assessment.findUnique({
      where: { id: assessmentId },
      include: {
        skill: true,
        questions: {
          include: { choices: true },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!assessment || !assessment.isActive) {
      throw new BadRequestException('Assessment is not active or does not exist.');
    }

    const readiness = validateAssessmentReadiness(assessment as any);
    if (!readiness.isReady) {
      throw new BadRequestException(
        `Assessment is not ready: ${readiness.readinessError}`,
      );
    }

    const canAccess = await this.canCandidateAccessAssessment(candidateId, assessment);
    if (!canAccess) {
      throw new ForbiddenException(
        'You do not have permission to start this company assessment.',
      );
    }

    const currentSnapshot = buildAssessmentSnapshot(assessment as any);

    // Check for an existing IN_PROGRESS attempt to resume
    const existingAttempt = await this.prisma.assessmentAttempt.findFirst({
      where: {
        assessmentId,
        candidateId,
        status: AttemptStatus.IN_PROGRESS,
      },
      include: {
        assessment: { include: { skill: true } },
        answers: true,
      },
      orderBy: { startedAt: 'desc' },
    });

    if (existingAttempt) {
      const existingSnap = existingAttempt.snapshot as any;
      const expired = this.isAttemptTimerExpired(
        existingAttempt.startedAt,
        existingSnap?.timeLimitMinutes || assessment.timeLimitMinutes,
        30,
      );

      if (expired) {
        await this.prisma.assessmentAttempt.update({
          where: { id: existingAttempt.id },
          data: {
            status: AttemptStatus.EXPIRED,
            completedAt: new Date(),
          },
        });
      } else if (existingSnap?.criteriaHash === currentSnapshot.criteriaHash) {
        return {
          ...formatAttemptForCandidate(existingAttempt),
          resumed: true,
          timeLimitMinutes: existingSnap?.timeLimitMinutes || assessment.timeLimitMinutes,
        };
      } else {
        // Criteria changed between attempts; close old attempt so it does not silently grade against new questions
        await this.prisma.assessmentAttempt.update({
          where: { id: existingAttempt.id },
          data: {
            status: AttemptStatus.EXPIRED,
            completedAt: new Date(),
          },
        });
      }
    }

    const maxScore = assessment.questions.reduce((sum, q) => sum + (q.points || 0), 0);

    const created = await this.prisma.assessmentAttempt.create({
      data: {
        assessmentId: assessment.id,
        candidateId,
        status: AttemptStatus.IN_PROGRESS,
        assessmentVersion: assessment.version,
        maxScore: maxScore > 0 ? maxScore : 100,
        snapshot: currentSnapshot as any,
        draftCode: { codes: {}, selectedChoices: {} } as any,
        integrityEvents: [] as any,
      },
      include: {
        assessment: { include: { skill: true } },
        answers: true,
      },
    });

    return {
      ...formatAttemptForCandidate(created),
      resumed: false,
      timeLimitMinutes: assessment.timeLimitMinutes,
    };
  }

  private async getActiveAttemptForCandidate(
    user: any,
    assessmentId: string,
    attemptId: string,
  ) {
    const candidateId = user?.candidateProfile?.id;
    const attempt = await this.prisma.assessmentAttempt.findUnique({
      where: { id: attemptId },
      include: {
        assessment: {
          include: {
            skill: true,
            questions: {
              include: { choices: true },
              orderBy: { createdAt: 'asc' },
            },
          },
        },
        answers: true,
      },
    });

    if (!attempt || attempt.assessmentId !== assessmentId) {
      throw new NotFoundException('Assessment attempt not found.');
    }

    if (attempt.candidateId !== candidateId) {
      throw new ForbiddenException('You do not own this assessment attempt.');
    }

    if (attempt.status !== AttemptStatus.IN_PROGRESS) {
      throw new BadRequestException(
        `Attempt is no longer in progress (current status: ${attempt.status}).`,
      );
    }

    const snap = attempt.snapshot as any;
    const timeLimit = snap?.timeLimitMinutes || attempt.assessment.timeLimitMinutes;

    if (this.isAttemptTimerExpired(attempt.startedAt, timeLimit, 30)) {
      await this.prisma.assessmentAttempt.update({
        where: { id: attempt.id },
        data: {
          status: AttemptStatus.EXPIRED,
          completedAt: new Date(),
        },
      });
      throw new BadRequestException('Assessment attempt time limit has expired.');
    }

    // Verify criteriaHash integrity against current assessment
    const liveSnapshot = buildAssessmentSnapshot(attempt.assessment as any);
    if (snap?.criteriaHash && snap.criteriaHash !== liveSnapshot.criteriaHash) {
      throw new ConflictException(
        'Assessment criteria changed since this attempt started. Please start a new attempt.',
      );
    }

    return attempt;
  }

  async autosaveAttempt(
    user: any,
    assessmentId: string,
    body: { attemptId: string; draftCode: Record<string, any> },
  ) {
    if (!body?.attemptId) {
      throw new BadRequestException('attemptId is required.');
    }
    const attempt = await this.getActiveAttemptForCandidate(user, assessmentId, body.attemptId);

    const updated = await this.prisma.assessmentAttempt.update({
      where: { id: attempt.id },
      data: {
        draftCode: (body.draftCode || {}) as any,
        timeSpentSeconds: Math.max(
          0,
          Math.floor((Date.now() - attempt.startedAt.getTime()) / 1000),
        ),
      },
    });

    return {
      ok: true,
      attemptId: updated.id,
      draftCode: updated.draftCode,
    };
  }

  async recordIntegrityEvent(
    user: any,
    assessmentId: string,
    body: { attemptId: string; type: string; metadata?: any },
  ) {
    if (!body?.attemptId || !body?.type) {
      throw new BadRequestException('attemptId and event type are required.');
    }
    const attempt = await this.getActiveAttemptForCandidate(user, assessmentId, body.attemptId);
    const currentEvents = Array.isArray(attempt.integrityEvents)
      ? [...(attempt.integrityEvents as any[])]
      : [];

    currentEvents.push({
      type: String(body.type).slice(0, 100),
      timestamp: new Date().toISOString(),
      metadata: body.metadata ?? null,
    });

    await this.prisma.assessmentAttempt.update({
      where: { id: attempt.id },
      data: { integrityEvents: currentEvents.slice(-200) as any },
    });

    return { ok: true, count: currentEvents.length };
  }

  async runCodePublicCases(
    user: any,
    assessmentId: string,
    body: { attemptId: string; questionId: string; sourceCode: string },
  ) {
    const candidateId = user?.candidateProfile?.id;
    const now = Date.now();
    const lastRun = this.runCodeTimestamps.get(candidateId) || 0;
    if (now - lastRun < 3000 && process.env.DISABLE_RUN_CODE_RATE_LIMIT !== 'true') {
      throw new HttpException(
        'Please wait 3 seconds between code executions.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    this.runCodeTimestamps.set(candidateId, now);

    const attempt = await this.getActiveAttemptForCandidate(user, assessmentId, body.attemptId);
    const question = attempt.assessment.questions.find((q) => q.id === body.questionId);
    if (!question) {
      throw new NotFoundException('Question not found in this assessment.');
    }

    if (question.evaluationMethod === QuestionEvaluationMethod.OPEN_ENDED) {
      const openRun = await this.judge0.runOpenEndedRaw(
        body.sourceCode,
        question.starterCode,
      );
      if (!openRun.engineAvailable) {
        throw new ServiceUnavailableException(
          openRun.errorMessage || 'Code execution service is currently unavailable.',
        );
      }
      return {
        mode: 'OPEN_ENDED',
        stdout: openRun.stdout,
        stderr: openRun.stderr,
        statusDescription: openRun.statusDescription,
      };
    }

    const allTestCases: TestCaseItem[] = Array.isArray(question.testCases)
      ? (question.testCases as unknown as TestCaseItem[])
      : [];
    // Run Code ONLY executes visible (public) test cases!
    const visibleCases = allTestCases.filter((tc) => !tc.isHidden);

    const runResult = await this.judge0.runAutomatedTestCases(
      body.sourceCode,
      question.starterCode,
      visibleCases,
    );

    if (!runResult.engineAvailable) {
      throw new ServiceUnavailableException(
        runResult.errorMessage || 'Code execution service is currently unavailable.',
      );
    }

    return {
      mode: 'AUTOMATED_TEST_CASES',
      passedCount: runResult.passedCount,
      totalVisibleCount: visibleCases.length,
      hiddenCaseCount: allTestCases.length - visibleCases.length,
      results: runResult.results,
    };
  }

  async submitTheory(
    user: any,
    assessmentId: string,
    body: {
      attemptId: string;
      answers: Array<{ questionId: string; selectedChoiceId: string }>;
    },
  ) {
    if (!body?.attemptId || !Array.isArray(body?.answers)) {
      throw new BadRequestException('attemptId and answers array are required.');
    }

    const attempt = await this.getActiveAttemptForCandidate(user, assessmentId, body.attemptId);
    if (attempt.assessment.type !== AssessmentType.THEORY) {
      throw new BadRequestException('This assessment is not a THEORY assessment.');
    }

    // Compare-and-set to SUBMITTING
    const cas = await this.prisma.assessmentAttempt.updateMany({
      where: { id: attempt.id, status: AttemptStatus.IN_PROGRESS },
      data: { status: AttemptStatus.SUBMITTING },
    });
    if (cas.count === 0) {
      throw new ConflictException('Attempt is already being submitted.');
    }

    const answerMap = new Map<string, string>();
    for (const ans of body.answers) {
      if (ans?.questionId && ans?.selectedChoiceId) {
        answerMap.set(String(ans.questionId), String(ans.selectedChoiceId));
      }
    }

    const isCompanyExam = Boolean(attempt.assessment.companyId);
    let totalPoints = 0;
    let earnedPoints = 0;

    await this.prisma.assessmentAnswer.deleteMany({ where: { attemptId: attempt.id } });

    for (const q of attempt.assessment.questions) {
      totalPoints += q.points;
      const selectedChoiceId = answerMap.get(q.id) || null;
      const choice = q.choices.find((c) => c.id === selectedChoiceId);
      const isCorrect = Boolean(choice?.isCorrect);
      const pts = isCorrect ? q.points : 0;
      earnedPoints += pts;

      await this.prisma.assessmentAnswer.create({
        data: {
          attemptId: attempt.id,
          questionId: q.id,
          selectedChoiceId,
          isCorrect,
          pointsEarned: pts,
        },
      });
    }

    const maxScore = totalPoints > 0 ? totalPoints : 100;
    const rawPercentage = Math.round((earnedPoints / maxScore) * 100);
    const timeSpentSeconds = Math.max(
      0,
      Math.floor((Date.now() - attempt.startedAt.getTime()) / 1000),
    );

    const completed = await this.prisma.assessmentAttempt.update({
      where: { id: attempt.id },
      data: isCompanyExam
        ? {
            status: AttemptStatus.COMPLETED,
            reviewStatus: AssessmentReviewStatus.PENDING_HUMAN_REVIEW,
            score: null,
            maxScore,
            percentage: null,
            finalScore: null,
            passed: null,
            timeSpentSeconds,
            completedAt: new Date(),
          }
        : {
            status: AttemptStatus.COMPLETED,
            reviewStatus: AssessmentReviewStatus.NOT_REQUIRED,
            score: earnedPoints,
            maxScore,
            percentage: rawPercentage,
            finalScore: rawPercentage,
            passed: rawPercentage >= attempt.assessment.passingScore,
            timeSpentSeconds,
            completedAt: new Date(),
          },
      include: {
        assessment: { include: { skill: true } },
        answers: true,
      },
    });

    return formatAttemptForCandidate(completed);
  }

  async submitCodingQuestion(
    user: any,
    assessmentId: string,
    body: {
      attemptId: string;
      questionId: string;
      sourceCode: string;
      candidateExplanation?: string;
    },
  ) {
    if (!body?.attemptId || !body?.questionId) {
      throw new BadRequestException('attemptId and questionId are required.');
    }
    this.judge0.validateSourceLength(body.sourceCode);

    const attempt = await this.getActiveAttemptForCandidate(user, assessmentId, body.attemptId);
    if (attempt.assessment.type !== AssessmentType.PRACTICAL_CODING) {
      throw new BadRequestException('This assessment is not a PRACTICAL_CODING assessment.');
    }

    const question = attempt.assessment.questions.find((q) => q.id === body.questionId);
    if (!question) {
      throw new NotFoundException('Question not found in this assessment.');
    }

    const isCompanyManual = Boolean(attempt.assessment.companyId);

    // Branch 1: Company Assessment (COMPANY_MANUAL) -> Never call AI; store execution evidence and hold for human review
    if (isCompanyManual) {
      const openRun = await this.judge0.runOpenEndedRaw(
        body.sourceCode,
        question.starterCode,
      );

      await this.prisma.assessmentAnswer.deleteMany({
        where: { attemptId: attempt.id, questionId: question.id },
      });

      await this.prisma.assessmentAnswer.create({
        data: {
          attemptId: attempt.id,
          questionId: question.id,
          submittedCode: body.sourceCode,
          isCorrect: false,
          pointsEarned: 0,
          executionResult: {
            mode: 'COMPANY_MANUAL',
            engineAvailable: openRun.engineAvailable,
            statusDescription: openRun.engineAvailable
              ? openRun.statusDescription
              : 'SYSTEM_ERROR',
            stdout: openRun.stdout,
            stderr: openRun.stderr,
            candidateExplanation: body.candidateExplanation ?? null,
          } as any,
        },
      });

      const answeredCount = await this.prisma.assessmentAnswer.count({
        where: { attemptId: attempt.id },
      });

      if (answeredCount >= attempt.assessment.questions.length) {
        return this.finalizeCodingAttempt(user, assessmentId, { attemptId: attempt.id });
      }

      const refreshed = await this.prisma.assessmentAttempt.findUnique({
        where: { id: attempt.id },
        include: { assessment: { include: { skill: true } }, answers: true },
      });
      return formatAttemptForCandidate(refreshed);
    }

    // Branch 2: Platform Assessment - OPEN_ENDED
    if (question.evaluationMethod === QuestionEvaluationMethod.OPEN_ENDED) {
      const openRun = await this.judge0.runOpenEndedRaw(
        body.sourceCode,
        question.starterCode,
      );

      const aiResult = await this.aiEvaluator.evaluateOpenEndedSubmission({
        questionTitle: question.title,
        questionPrompt: question.prompt,
        sourceCode: body.sourceCode,
        candidateExplanation: body.candidateExplanation,
        customRubric: question.rubric,
        executionReport: openRun,
      });

      const pointsEarned =
        aiResult.available && aiResult.overallScore !== null
          ? Math.round((aiResult.overallScore / 100) * question.points * 10) / 10
          : 0;

      await this.prisma.assessmentAnswer.deleteMany({
        where: { attemptId: attempt.id, questionId: question.id },
      });

      await this.prisma.assessmentAnswer.create({
        data: {
          attemptId: attempt.id,
          questionId: question.id,
          submittedCode: body.sourceCode,
          isCorrect:
            aiResult.available &&
            aiResult.overallScore !== null &&
            aiResult.overallScore >= attempt.assessment.passingScore,
          pointsEarned,
          executionResult: {
            mode: 'PLATFORM_OPEN_ENDED',
            execution: openRun,
            aiEvaluation: aiResult,
            candidateExplanation: body.candidateExplanation ?? null,
          } as any,
        },
      });

      const answeredCount = await this.prisma.assessmentAnswer.count({
        where: { attemptId: attempt.id },
      });

      if (answeredCount >= attempt.assessment.questions.length) {
        return this.finalizeCodingAttempt(user, assessmentId, { attemptId: attempt.id });
      }

      const refreshed = await this.prisma.assessmentAttempt.findUnique({
        where: { id: attempt.id },
        include: { assessment: { include: { skill: true } }, answers: true },
      });
      return formatAttemptForCandidate(refreshed);
    }

    // Branch 3: Platform Assessment - AUTOMATED_TEST_CASES
    const allCases: TestCaseItem[] = Array.isArray(question.testCases)
      ? (question.testCases as unknown as TestCaseItem[])
      : [];

    const runResult = await this.judge0.runAutomatedTestCases(
      body.sourceCode,
      question.starterCode,
      allCases,
    );

    if (!runResult.engineAvailable || runResult.systemError) {
      // Never convert Judge0 outage into a failed 0 score!
      await this.prisma.assessmentAttempt.update({
        where: { id: attempt.id },
        data: {
          status: AttemptStatus.SYSTEM_ERROR,
          score: null,
          percentage: null,
          finalScore: null,
          passed: null,
        },
      });
      throw new ServiceUnavailableException(
        runResult.errorMessage || 'Judge0 sandbox is unavailable. Attempt marked as SYSTEM_ERROR.',
      );
    }

    const totalCases = Math.max(1, runResult.totalCount);
    const pointsEarned =
      Math.round((runResult.passedCount / totalCases) * question.points * 10) / 10;
    const isAllPassed = runResult.passedCount === runResult.totalCount;

    await this.prisma.assessmentAnswer.deleteMany({
      where: { attemptId: attempt.id, questionId: question.id },
    });

    await this.prisma.assessmentAnswer.create({
      data: {
        attemptId: attempt.id,
        questionId: question.id,
        submittedCode: body.sourceCode,
        isCorrect: isAllPassed,
        pointsEarned,
        executionResult: {
          mode: 'AUTOMATED_TEST_CASES',
          passedCount: runResult.passedCount,
          totalCount: runResult.totalCount,
          results: runResult.results,
          candidateExplanation: body.candidateExplanation ?? null,
        } as any,
      },
    });

    const answeredCount = await this.prisma.assessmentAnswer.count({
      where: { attemptId: attempt.id },
    });

    if (answeredCount >= attempt.assessment.questions.length) {
      return this.finalizeCodingAttempt(user, assessmentId, { attemptId: attempt.id });
    }

    const refreshed = await this.prisma.assessmentAttempt.findUnique({
      where: { id: attempt.id },
      include: { assessment: { include: { skill: true } }, answers: true },
    });
    return formatAttemptForCandidate(refreshed);
  }

  async finalizeCodingAttempt(
    user: any,
    assessmentId: string,
    body: { attemptId: string },
  ) {
    if (!body?.attemptId) {
      throw new BadRequestException('attemptId is required.');
    }

    const existing = await this.prisma.assessmentAttempt.findUnique({
      where: { id: body.attemptId },
      include: {
        assessment: { include: { skill: true } },
        answers: true,
      },
    });
    if (
      existing &&
      existing.assessmentId === assessmentId &&
      existing.candidateId === user?.candidateProfile?.id &&
      existing.status === AttemptStatus.COMPLETED
    ) {
      return formatAttemptForCandidate(existing);
    }

    const attempt = await this.getActiveAttemptForCandidate(user, assessmentId, body.attemptId);

    const cas = await this.prisma.assessmentAttempt.updateMany({
      where: { id: attempt.id, status: AttemptStatus.IN_PROGRESS },
      data: { status: AttemptStatus.SUBMITTING },
    });
    if (cas.count === 0) {
      throw new ConflictException('Attempt is already being finalized.');
    }

    const answers = await this.prisma.assessmentAnswer.findMany({
      where: { attemptId: attempt.id },
    });

    const timeSpentSeconds = Math.max(
      0,
      Math.floor((Date.now() - attempt.startedAt.getTime()) / 1000),
    );
    const maxScore =
      attempt.assessment.questions.reduce((sum, q) => sum + (q.points || 0), 0) || 100;

    // Company manual assessment always enters PENDING_HUMAN_REVIEW with null scores
    if (attempt.assessment.companyId) {
      const completedCompany = await this.prisma.assessmentAttempt.update({
        where: { id: attempt.id },
        data: {
          status: AttemptStatus.COMPLETED,
          reviewStatus: AssessmentReviewStatus.PENDING_HUMAN_REVIEW,
          score: null,
          maxScore,
          percentage: null,
          aiScore: null,
          humanScore: null,
          finalScore: null,
          passed: null,
          timeSpentSeconds,
          completedAt: new Date(),
        },
        include: {
          assessment: { include: { skill: true } },
          answers: true,
        },
      });
      return formatAttemptForCandidate(completedCompany);
    }

    // Check if any platform open-ended question is pending AI evaluation
    const hasPendingAi = answers.some(
      (a) => (a.executionResult as any)?.aiEvaluation?.status === 'EVALUATION_PENDING',
    );
    const hasOpenEndedUnanswered = attempt.assessment.questions.some(
      (q) =>
        q.evaluationMethod === QuestionEvaluationMethod.OPEN_ENDED &&
        !answers.some((a) => a.questionId === q.id),
    );

    if (hasPendingAi) {
      const pendingAttempt = await this.prisma.assessmentAttempt.update({
        where: { id: attempt.id },
        data: {
          status: AttemptStatus.COMPLETED,
          reviewStatus: AssessmentReviewStatus.EVALUATION_PENDING,
          score: null,
          maxScore,
          percentage: null,
          aiScore: null,
          finalScore: null,
          passed: null,
          timeSpentSeconds,
          completedAt: new Date(),
        },
        include: {
          assessment: { include: { skill: true } },
          answers: true,
        },
      });
      return formatAttemptForCandidate(pendingAttempt);
    }

    const totalEarned =
      Math.round(answers.reduce((sum, a) => sum + Number(a.pointsEarned || 0), 0) * 10) /
      10;
    const percentage = Math.round((totalEarned / maxScore) * 100);
    const passed = percentage >= attempt.assessment.passingScore;

    const firstAiEval = answers
      .map((a) => (a.executionResult as any)?.aiEvaluation)
      .find(Boolean);

    const completed = await this.prisma.assessmentAttempt.update({
      where: { id: attempt.id },
      data: {
        status: AttemptStatus.COMPLETED,
        reviewStatus: AssessmentReviewStatus.NOT_REQUIRED,
        score: totalEarned,
        maxScore,
        percentage,
        aiScore: firstAiEval && !hasOpenEndedUnanswered ? percentage : null,
        finalScore: percentage,
        passed,
        evaluationSnapshot: firstAiEval ?? null,
        evaluatorModel: firstAiEval?.evaluatorModel ?? null,
        evaluatorProvider: firstAiEval?.evaluatorProvider ?? null,
        promptVersion: firstAiEval?.promptVersion ?? null,
        timeSpentSeconds,
        completedAt: new Date(),
      },
      include: {
        assessment: { include: { skill: true } },
        answers: true,
      },
    });

    return formatAttemptForCandidate(completed);
  }

  async getAttemptReview(user: any, attemptId: string) {
    const attempt = await this.prisma.assessmentAttempt.findUnique({
      where: { id: attemptId },
      include: {
        assessment: {
          include: {
            skill: true,
            questions: {
              include: { choices: true },
              orderBy: { createdAt: 'asc' },
            },
          },
        },
        candidate: {
          select: {
            id: true,
            userId: true,
            fullName: true,
            headline: true,
            githubUsername: true,
          },
        },
        answers: true,
      },
    });

    if (!attempt) {
      throw new NotFoundException('Assessment attempt not found.');
    }

    const isOwnerCandidate =
      user.role === UserRole.CANDIDATE &&
      user.candidateProfile?.id === attempt.candidateId;

    const isOwningCompany =
      user.role === UserRole.COMPANY &&
      Boolean(attempt.assessment.companyId) &&
      (user.companyMembers || []).some(
        (cm: any) => cm.companyId === attempt.assessment.companyId,
      );

    const isAdmin = user.role === UserRole.ADMIN;

    if (!isOwnerCandidate && !isOwningCompany && !isAdmin) {
      throw new ForbiddenException('You do not have permission to review this attempt.');
    }

    if (isOwnerCandidate) {
      return formatAttemptForCandidate(attempt);
    }

    // Reviewer (Company / Admin) gets full review payload including integrityEvents and execution details
    return {
      ...attempt,
      effectivePercentage: readAttemptPercentage(attempt as any),
    };
  }

  async retryPendingEvaluation(user: any, attemptId: string) {
    const attempt = await this.prisma.assessmentAttempt.findUnique({
      where: { id: attemptId },
      include: {
        assessment: {
          include: { questions: true, skill: true },
        },
        answers: true,
      },
    });

    if (!attempt) {
      throw new NotFoundException('Attempt not found.');
    }

    const isOwnerCandidate =
      user.role === UserRole.CANDIDATE &&
      user.candidateProfile?.id === attempt.candidateId;
    const isAdmin = user.role === UserRole.ADMIN;

    if (!isOwnerCandidate && !isAdmin) {
      throw new ForbiddenException('Not authorized to retry evaluation for this attempt.');
    }

    if (
      attempt.reviewStatus !== AssessmentReviewStatus.EVALUATION_PENDING &&
      attempt.reviewStatus !== AssessmentReviewStatus.EVALUATION_FAILED
    ) {
      throw new BadRequestException('Attempt is not in a pending/failed evaluation state.');
    }

    let allSucceeded = true;
    let totalEarned = 0;
    let lastAiResult: any = null;

    for (const ans of attempt.answers) {
      const q = attempt.assessment.questions.find((item) => item.id === ans.questionId);
      if (!q || q.evaluationMethod !== QuestionEvaluationMethod.OPEN_ENDED) {
        totalEarned += Number(ans.pointsEarned || 0);
        continue;
      }

      const openRun = await this.judge0.runOpenEndedRaw(
        ans.submittedCode || '',
        q.starterCode,
      );
      const aiRes = await this.aiEvaluator.evaluateOpenEndedSubmission({
        questionTitle: q.title,
        questionPrompt: q.prompt,
        sourceCode: ans.submittedCode || '',
        candidateExplanation: (ans.executionResult as any)?.candidateExplanation,
        customRubric: q.rubric,
        executionReport: openRun,
      });

      if (!aiRes.available || aiRes.overallScore === null) {
        allSucceeded = false;
        break;
      }

      lastAiResult = aiRes;
      const pts = Math.round((aiRes.overallScore / 100) * q.points * 10) / 10;
      totalEarned += pts;

      await this.prisma.assessmentAnswer.update({
        where: { id: ans.id },
        data: {
          pointsEarned: pts,
          isCorrect: aiRes.overallScore >= attempt.assessment.passingScore,
          executionResult: {
            ...(ans.executionResult as any),
            execution: openRun,
            aiEvaluation: aiRes,
          } as any,
        },
      });
    }

    if (!allSucceeded) {
      return formatAttemptForCandidate(attempt);
    }

    const maxScore = attempt.maxScore || 100;
    const percentage = Math.round((totalEarned / maxScore) * 100);

    const updated = await this.prisma.assessmentAttempt.update({
      where: { id: attempt.id },
      data: {
        reviewStatus: AssessmentReviewStatus.NOT_REQUIRED,
        score: totalEarned,
        percentage,
        aiScore: percentage,
        finalScore: percentage,
        passed: percentage >= attempt.assessment.passingScore,
        evaluationSnapshot: lastAiResult ?? null,
        evaluatorModel: lastAiResult?.evaluatorModel ?? null,
        evaluatorProvider: lastAiResult?.evaluatorProvider ?? null,
        promptVersion: lastAiResult?.promptVersion ?? null,
      },
      include: {
        assessment: { include: { skill: true } },
        answers: true,
      },
    });

    return isOwnerCandidate ? formatAttemptForCandidate(updated) : updated;
  }

  async overrideScoreByReviewer(
    user: any,
    attemptId: string,
    body: {
      humanScore: number;
      reviewReason: string;
      reviewFeedback?: string;
    },
  ) {
    const attempt = await this.prisma.assessmentAttempt.findUnique({
      where: { id: attemptId },
      include: {
        assessment: true,
        candidate: true,
      },
    });

    if (!attempt) {
      throw new NotFoundException('Assessment attempt not found.');
    }

    const isAdmin = user.role === UserRole.ADMIN;
    const isOwningCompany =
      user.role === UserRole.COMPANY &&
      Boolean(attempt.assessment.companyId) &&
      (user.companyMembers || []).some(
        (cm: any) => cm.companyId === attempt.assessment.companyId,
      );

    if (!isAdmin && !isOwningCompany) {
      throw new ForbiddenException(
        'Only an ADMIN or a member of the company owning this assessment can review scores.',
      );
    }

    if (
      attempt.status !== AttemptStatus.COMPLETED &&
      attempt.status !== AttemptStatus.EXPIRED
    ) {
      throw new BadRequestException(
        'Can only review attempts that are COMPLETED or EXPIRED.',
      );
    }

    const humanScore = Number(body?.humanScore);
    if (!Number.isFinite(humanScore) || humanScore < 0 || humanScore > 100) {
      throw new BadRequestException('humanScore must be a number between 0 and 100.');
    }

    const reviewReason = String(body?.reviewReason || '').trim();
    if (!reviewReason || reviewReason.length > 5000) {
      throw new BadRequestException(
        'reviewReason is required and must not exceed 5000 characters.',
      );
    }

    const reviewFeedback =
      body?.reviewFeedback !== undefined && body?.reviewFeedback !== null
        ? String(body.reviewFeedback).trim()
        : null;
    if (reviewFeedback && reviewFeedback.length > 5000) {
      throw new BadRequestException('reviewFeedback must not exceed 5000 characters.');
    }

    const roundedScore = Math.round(humanScore * 10) / 10;
    const passed = roundedScore >= attempt.assessment.passingScore;
    const existingEvalSnap =
      attempt.evaluationSnapshot && typeof attempt.evaluationSnapshot === 'object'
        ? (attempt.evaluationSnapshot as Record<string, any>)
        : {};

    const updated = await this.prisma.assessmentAttempt.update({
      where: { id: attempt.id },
      data: {
        humanScore: roundedScore,
        finalScore: roundedScore,
        percentage: roundedScore,
        passed,
        reviewStatus: AssessmentReviewStatus.HUMAN_REVIEWED,
        reviewedById: user.id,
        reviewedAt: new Date(),
        reviewReason,
        evaluationSnapshot: {
          ...existingEvalSnap,
          reviewFeedback,
          reviewedById: user.id,
          reviewedAt: new Date().toISOString(),
        } as any,
      },
      include: {
        assessment: { include: { skill: true } },
        answers: true,
      },
    });

    if (attempt.candidate?.userId) {
      await this.notifications.createNotification({
        userId: attempt.candidate.userId,
        type: NotificationType.ASSESSMENT_ASSIGNED,
        title: 'ผลการตรวจข้อสอบได้รับการอัปเดต',
        message: `ข้อสอบ "${attempt.assessment.title}" ได้รับการตรวจทานเรียบร้อยแล้ว`,
        link: `/assessments`,
        metadata: { attemptId: attempt.id, assessmentId: attempt.assessmentId },
      });
    }

    return updated;
  }
}
