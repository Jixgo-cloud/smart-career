const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  readAttemptPercentage,
  buildAssessmentSnapshot,
  validateAssessmentReadiness,
  evaluateFrameworkCoverage,
  assessedSkills,
  assessmentMatch,
} = require('../packages/shared/dist/index.js');

describe('SmartCareer Shared Policy & Scoring Engine', () => {
  const jsSkill = { id: '22222222-2222-4222-8222-222222222222', name: 'JavaScript', slug: 'javascript', category: 'FRONTEND' };
  const sqlSkill = { id: '33333333-3333-4333-8333-333333333333', name: 'SQL', slug: 'sql', category: 'DATABASE' };

  const validJsSnapshot = buildAssessmentSnapshot({
    id: 'exam-js-1',
    companyId: null,
    version: 1,
    type: 'PRACTICAL_CODING',
    passingScore: 70,
    timeLimitMinutes: 30,
    feedbackVisibility: 'IMMEDIATE',
    skill: jsSkill,
    questions: [
      {
        id: 'q-js-1',
        title: 'Add numbers',
        points: 10,
        evaluationMethod: 'AUTOMATED_TEST_CASES',
        testCases: [
          { input: '[1,2]', expectedOutput: '3', isHidden: false },
          { input: '[-1,1]', expectedOutput: '0', isHidden: true },
        ],
      },
    ],
  });

  const validSqlSnapshot = buildAssessmentSnapshot({
    id: 'exam-sql-1',
    companyId: null,
    version: 1,
    type: 'PRACTICAL_CODING',
    passingScore: 60,
    timeLimitMinutes: 30,
    feedbackVisibility: 'IMMEDIATE',
    skill: sqlSkill,
    questions: [
      {
        id: 'q-sql-1',
        title: 'Filter rows',
        points: 100,
        evaluationMethod: 'AUTOMATED_TEST_CASES',
        testCases: [
          { input: '[[], 0]', expectedOutput: '{}', isHidden: false },
          { input: '[[], 10]', expectedOutput: '{}', isHidden: true },
        ],
      },
    ],
  });

  it('readAttemptPercentage follows humanScore -> finalScore -> percentage -> score/maxScore and respects pending states', () => {
    assert.equal(readAttemptPercentage({ status: 'IN_PROGRESS', score: 80, maxScore: 100 }), null);
    assert.equal(readAttemptPercentage({ status: 'COMPLETED', reviewStatus: 'EVALUATION_PENDING', score: 80, maxScore: 100 }), null);
    assert.equal(readAttemptPercentage({ status: 'COMPLETED', reviewStatus: 'PENDING_HUMAN_REVIEW', score: 80, maxScore: 100 }), null);
    assert.equal(
      readAttemptPercentage({
        status: 'COMPLETED',
        reviewStatus: 'HUMAN_REVIEWED',
        humanScore: 85,
        finalScore: 60,
        percentage: 50,
      }),
      85,
    );
    assert.equal(
      readAttemptPercentage({
        status: 'COMPLETED',
        reviewStatus: 'NOT_REQUIRED',
        score: 7,
        maxScore: 10,
      }),
      70,
    );
    assert.equal(
      readAttemptPercentage({
        status: 'COMPLETED',
        reviewStatus: 'NOT_REQUIRED',
        score: 0,
        maxScore: 10,
      }),
      0,
    );
  });

  it('Matching when unassessed -> matchScore=null, status=AWAITING_ASSESSMENT, coverage=0', () => {
    const map = assessedSkills([]);
    const match = assessmentMatch(
      'job-1',
      [
        { skillId: jsSkill.id, skillName: 'JavaScript', isRequired: true, minimumScore: 70 },
        { skillId: sqlSkill.id, skillName: 'SQL', isRequired: true, minimumScore: 60 },
      ],
      map,
    );

    assert.equal(match.matchScore, null);
    assert.equal(match.status, 'AWAITING_ASSESSMENT');
    assert.equal(match.assessmentCoverage, 0);
    assert.equal(match.assessedCount, 0);
    assert.equal(match.unassessedSkills.length, 2);
    assert.equal(match.missingSkills.length, 0);
  });

  it('Matching when 1 of 2 skills assessed (JS=80/70, SQL unassessed) -> matchScore=100, coverage=50, PRELIMINARY, SQL is NOT_ASSESSED not GAP', () => {
    const map = assessedSkills([
      {
        id: 'att-js-1',
        assessmentId: 'exam-js-1',
        status: 'COMPLETED',
        reviewStatus: 'NOT_REQUIRED',
        score: 8,
        maxScore: 10,
        percentage: 80,
        completedAt: '2026-10-27T10:00:00.000Z',
        snapshot: validJsSnapshot,
      },
    ]);

    const match = assessmentMatch(
      'job-1',
      [
        { skillId: jsSkill.id, skillName: 'JavaScript', isRequired: true, minimumScore: 70 },
        { skillId: sqlSkill.id, skillName: 'SQL', isRequired: true, minimumScore: 60 },
      ],
      map,
    );

    assert.equal(match.matchScore, 100);
    assert.equal(match.assessmentCoverage, 50);
    assert.equal(match.status, 'PRELIMINARY');
    assert.equal(match.matchedSkills.length, 1);
    assert.equal(match.missingSkills.length, 0);
    assert.equal(match.unassessedSkills.length, 1);
    assert.equal(match.unassessedSkills[0].skillId, sqlSkill.id);
    assert.equal(match.unassessedSkills[0].status, 'NOT_ASSESSED');
  });

  it('Matching when both skills assessed (JS=80/70, SQL=30/60) -> credit 100 & 50 -> matchScore=75, coverage=100, SQL is GAP of 30', () => {
    const map = assessedSkills([
      {
        id: 'att-js-1',
        assessmentId: 'exam-js-1',
        status: 'COMPLETED',
        reviewStatus: 'NOT_REQUIRED',
        percentage: 80,
        completedAt: '2026-10-27T10:00:00.000Z',
        snapshot: validJsSnapshot,
      },
      {
        id: 'att-sql-1',
        assessmentId: 'exam-sql-1',
        status: 'COMPLETED',
        reviewStatus: 'NOT_REQUIRED',
        percentage: 30,
        completedAt: '2026-10-27T10:05:00.000Z',
        snapshot: validSqlSnapshot,
      },
    ]);

    const match = assessmentMatch(
      'job-1',
      [
        { skillId: jsSkill.id, skillName: 'JavaScript', isRequired: true, minimumScore: 70 },
        { skillId: sqlSkill.id, skillName: 'SQL', isRequired: true, minimumScore: 60 },
      ],
      map,
    );

    assert.equal(match.matchScore, 75);
    assert.equal(match.assessmentCoverage, 100);
    assert.equal(match.status, 'ASSESSED');
    assert.equal(match.matchedSkills.length, 1);
    assert.equal(match.missingSkills.length, 1);
    assert.equal(match.missingSkills[0].skillId, sqlSkill.id);
    assert.equal(match.missingSkills[0].gap, 30);
  });

  it('Zero score from actual eligible attempt is counted as GAP and included in coverage (distinct from null)', () => {
    const map = assessedSkills([
      {
        id: 'att-sql-zero',
        assessmentId: 'exam-sql-1',
        status: 'COMPLETED',
        reviewStatus: 'NOT_REQUIRED',
        score: 0,
        maxScore: 100,
        percentage: 0,
        completedAt: '2026-10-27T10:05:00.000Z',
        snapshot: validSqlSnapshot,
      },
    ]);

    assert.equal(map.get(sqlSkill.id)?.score, 0);
    assert.equal(map.get(sqlSkill.id)?.status, 'GAP');

    const match = assessmentMatch(
      'job-1',
      [{ skillId: sqlSkill.id, skillName: 'SQL', isRequired: true, minimumScore: 60 }],
      map,
    );

    assert.equal(match.matchScore, 0);
    assert.equal(match.assessmentCoverage, 100);
    assert.equal(match.status, 'ASSESSED');
    assert.equal(match.missingSkills.length, 1);
    assert.equal(match.unassessedSkills.length, 0);
  });

  it('Selects LATEST eligible attempt per skill (not highest score), and ignores newer IN_PROGRESS/PENDING/THEORY/COMPANY attempts', () => {
    const theorySnapshot = {
      ...validJsSnapshot,
      assessmentType: 'THEORY',
    };
    const companySnapshot = {
      ...validJsSnapshot,
      gradingMode: 'COMPANY_MANUAL',
    };

    const map = assessedSkills([
      // Older attempt with higher score (80)
      {
        id: 'att-old-high',
        assessmentId: 'exam-js-1',
        status: 'COMPLETED',
        reviewStatus: 'NOT_REQUIRED',
        percentage: 80,
        completedAt: '2026-10-27T09:00:00.000Z',
        snapshot: validJsSnapshot,
      },
      // Newer eligible attempt with lower score (40) -> MUST be selected
      {
        id: 'att-new-low',
        assessmentId: 'exam-js-1',
        status: 'COMPLETED',
        reviewStatus: 'NOT_REQUIRED',
        percentage: 40,
        completedAt: '2026-10-27T10:00:00.000Z',
        snapshot: validJsSnapshot,
      },
      // Even newer attempt but IN_PROGRESS -> MUST be ignored
      {
        id: 'att-in-progress',
        assessmentId: 'exam-js-1',
        status: 'IN_PROGRESS',
        reviewStatus: 'NOT_REQUIRED',
        percentage: 100,
        startedAt: '2026-10-27T11:00:00.000Z',
        snapshot: validJsSnapshot,
      },
      // Even newer THEORY attempt -> MUST be ignored
      {
        id: 'att-theory',
        assessmentId: 'exam-theory-1',
        status: 'COMPLETED',
        reviewStatus: 'NOT_REQUIRED',
        percentage: 100,
        completedAt: '2026-10-27T11:30:00.000Z',
        snapshot: theorySnapshot,
      },
      // Even newer COMPANY attempt -> MUST be ignored
      {
        id: 'att-company',
        assessmentId: 'exam-company-1',
        status: 'COMPLETED',
        reviewStatus: 'HUMAN_REVIEWED',
        humanScore: 95,
        completedAt: '2026-10-27T12:00:00.000Z',
        snapshot: companySnapshot,
        assessment: { companyId: 'comp-1' },
      },
    ]);

    const jsRecord = map.get(jsSkill.id);
    assert.ok(jsRecord);
    assert.equal(jsRecord.attemptId, 'att-new-low');
    assert.equal(jsRecord.score, 40);
  });

  it('Validates assessment readiness and rejects placeholder choices or missing hidden test cases', () => {
    const badTheory = validateAssessmentReadiness({
      title: 'Bad Theory',
      type: 'THEORY',
      timeLimitMinutes: 30,
      passingScore: 70,
      questions: [
        {
          title: 'Q1',
          prompt: 'Pick one',
          points: 10,
          choices: [
            { text: 'Option A', isCorrect: true },
            { text: 'Option B', isCorrect: false },
          ],
        },
      ],
    });
    assert.equal(badTheory.isReady, false);

    const badCoding = validateAssessmentReadiness({
      title: 'Bad Coding',
      type: 'PRACTICAL_CODING',
      timeLimitMinutes: 30,
      passingScore: 70,
      questions: [
        {
          title: 'Q1',
          prompt: 'Solve it',
          points: 10,
          evaluationMethod: 'AUTOMATED_TEST_CASES',
          testCases: [
            { input: '[1]', expectedOutput: '1', isHidden: false },
            { input: '[2]', expectedOutput: '2', isHidden: false },
          ],
        },
      ],
    });
    assert.equal(badCoding.isReady, false);

    const goodCoding = validateAssessmentReadiness({
      title: 'Good Coding',
      type: 'PRACTICAL_CODING',
      timeLimitMinutes: 30,
      passingScore: 70,
      questions: [
        {
          title: 'Q1',
          prompt: 'Solve it',
          points: 10,
          evaluationMethod: 'AUTOMATED_TEST_CASES',
          testCases: [
            { input: '[1]', expectedOutput: '1', isHidden: false },
            { input: '[2]', expectedOutput: '2', isHidden: true },
          ],
        },
      ],
    });
    assert.equal(goodCoding.isReady, true);
  });

  it('Evaluates AZ-204 framework coverage accurately', () => {
    const practice = evaluateFrameworkCoverage({
      frameworkCode: 'AZ-204',
      frameworkVersion: '2026-01-14',
      frameworkScope: 'TOPIC_PRACTICE',
      questions: [
        {
          points: 10,
          frameworkTopicId: 'compute-functions',
          frameworkMappingNote: 'Tests Azure Functions trigger and binding configuration in detail.',
        },
      ],
    });
    assert.equal(practice.isValid, true);
  });

  it('Validates all assessments in prisma/assessment-bank/javascript-sandbox.json pass readiness', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const bankPath = path.join(__dirname, '..', 'prisma', 'assessment-bank', 'javascript-sandbox.json');
    const bank = JSON.parse(fs.readFileSync(bankPath, 'utf8'));
    assert.ok(Array.isArray(bank.assessments));
    assert.ok(bank.assessments.length >= 13, `Expected at least 13 assessments in bank, got ${bank.assessments.length}`);
    for (const exam of bank.assessments) {
      const readiness = validateAssessmentReadiness(exam);
      assert.equal(
        readiness.isReady,
        true,
        `Assessment "${exam.slug}" failed readiness: ${(readiness.errors || []).join('; ')}`,
      );
    }
  });
});
