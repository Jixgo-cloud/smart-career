'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';

export default function AssessmentRoomPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const assessmentId = params.id as string;
  const applicationId = searchParams.get('applicationId') || undefined;

  const [assessment, setAssessment] = useState<any>(null);
  const [attempt, setAttempt] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [runningCode, setRunningCode] = useState(false);
  const [error, setError] = useState('');
  const [runResult, setRunResult] = useState<any>(null);
  const [finalResult, setFinalResult] = useState<any>(null);

  // Answers state
  const [theoryAnswers, setTheoryAnswers] = useState<Record<string, string>>({});
  const [codeDrafts, setCodeDrafts] = useState<Record<string, string>>({});
  const [explanations, setExplanations] = useState<Record<string, string>>({});
  const [submittedQuestions, setSubmittedQuestions] = useState<Record<string, any>>({});
  const [activeQuestionIdx, setActiveQuestionIdx] = useState(0);
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);

  const initExam = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const exam = await apiFetch<any>(`/assessments/${assessmentId}`);
      setAssessment(exam);

      const started = await apiFetch<any>(`/assessments/${assessmentId}/start`, {
        method: 'POST',
        body: JSON.stringify({ applicationId }),
      });
      setAttempt(started);

      const savedCodes = started?.draftCode?.codes || started?.draftAnswers || {};
      const savedChoices = started?.draftCode?.selectedChoices || {};
      const savedExplanations = started?.draftCode?.explanations || {};

      const initialDrafts: Record<string, string> = {};
      (exam.questions || []).forEach((q: any) => {
        initialDrafts[q.id] =
          savedCodes[q.id] || q.starterCode || '// เขียนโค้ดคำตอบของคุณที่นี่\n';
      });
      setCodeDrafts(initialDrafts);
      if (savedChoices && typeof savedChoices === 'object') {
        setTheoryAnswers(savedChoices);
      }
      if (savedExplanations && typeof savedExplanations === 'object') {
        setExplanations(savedExplanations);
      }
    } catch (err: any) {
      setError(err.message || 'ไม่สามารถเริ่มต้นการสอบได้');
    } finally {
      setLoading(false);
    }
  }, [assessmentId, applicationId]);

  useEffect(() => {
    if (assessmentId) initExam();
  }, [assessmentId, initExam]);

  // Live countdown timer based on attempt.startedAt and timeLimitMinutes
  useEffect(() => {
    if (!attempt?.startedAt || finalResult) return;
    const limitMins =
      attempt?.timeLimitMinutes ??
      assessment?.timeLimitMinutes ??
      assessment?.timeLimitMins ??
      30;
    const deadlineMs = new Date(attempt.startedAt).getTime() + Number(limitMins) * 60 * 1000;

    const updateTimer = () => {
      const diffSec = Math.max(0, Math.floor((deadlineMs - Date.now()) / 1000));
      setRemainingSeconds(diffSec);
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [attempt?.startedAt, attempt?.timeLimitMinutes, assessment?.timeLimitMinutes, assessment?.timeLimitMins, finalResult]);

  // Integrity event listener (tab switch / visibilitychange)
  useEffect(() => {
    if (!attempt?.id || finalResult) return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        apiFetch(`/assessments/${assessmentId}/integrity-event`, {
          method: 'POST',
          body: JSON.stringify({
            attemptId: attempt.id,
            type: 'TAB_HIDDEN',
            metadata: { timestamp: new Date().toISOString() },
          }),
        }).catch(() => {});
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [assessmentId, attempt?.id, finalResult]);

  const handleAutosave = async () => {
    if (!attempt?.id) return;
    try {
      await apiFetch(`/assessments/${assessmentId}/autosave`, {
        method: 'POST',
        body: JSON.stringify({
          attemptId: attempt.id,
          draftCode: {
            codes: codeDrafts,
            selectedChoices: theoryAnswers,
            explanations,
          },
        }),
      });
    } catch {}
  };

  const handleRunVisibleTests = async (questionId: string) => {
    if (!attempt?.id) return;
    setRunningCode(true);
    setRunResult(null);
    setError('');
    try {
      const res = await apiFetch<any>(`/assessments/${assessmentId}/run-code`, {
        method: 'POST',
        body: JSON.stringify({
          attemptId: attempt.id,
          questionId,
          sourceCode: codeDrafts[questionId] || '',
        }),
      });
      setRunResult(res);
    } catch (err: any) {
      setError(err.message || 'รันโค้ดไม่สำเร็จ');
    } finally {
      setRunningCode(false);
    }
  };

  const handleSubmitQuestionCode = async (questionId: string) => {
    if (!attempt?.id) return;
    setSubmitting(true);
    setError('');
    try {
      const res = await apiFetch<any>(`/assessments/${assessmentId}/submit-coding`, {
        method: 'POST',
        body: JSON.stringify({
          attemptId: attempt.id,
          questionId,
          sourceCode: codeDrafts[questionId] || '',
          candidateExplanation: explanations[questionId]?.trim() || undefined,
        }),
      });
      setSubmittedQuestions((prev) => ({ ...prev, [questionId]: res }));
      if (res?.status === 'COMPLETED') {
        setFinalResult(res);
      }
    } catch (err: any) {
      setError(err.message || 'ส่งคำตอบข้อนี้ไม่สำเร็จ');
    } finally {
      setSubmitting(false);
    }
  };

  const handleFinalizeCoding = async () => {
    if (!attempt?.id) return;
    setSubmitting(true);
    setError('');
    try {
      const questions = assessment?.questions || [];
      let lastRes: any = null;
      for (const q of questions) {
        if (!submittedQuestions[q.id]) {
          lastRes = await apiFetch<any>(`/assessments/${assessmentId}/submit-coding`, {
            method: 'POST',
            body: JSON.stringify({
              attemptId: attempt.id,
              questionId: q.id,
              sourceCode: codeDrafts[q.id] || '',
              candidateExplanation: explanations[q.id]?.trim() || undefined,
            }),
          });
        }
      }
      if (lastRes?.status === 'COMPLETED') {
        setFinalResult(lastRes);
      } else {
        const finalized = await apiFetch<any>(
          `/assessments/${assessmentId}/finalize-attempt`,
          {
            method: 'POST',
            body: JSON.stringify({ attemptId: attempt.id }),
          },
        );
        setFinalResult(finalized);
      }
    } catch (err: any) {
      setError(err.message || 'ไม่สามารถยืนยันส่งข้อสอบได้');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmitTheory = async () => {
    if (!attempt?.id) return;
    setSubmitting(true);
    setError('');
    try {
      const formattedAnswers = Object.entries(theoryAnswers).map(
        ([questionId, selectedChoiceId]) => ({
          questionId,
          selectedChoiceId,
        }),
      );
      const res = await apiFetch<any>(`/assessments/${assessmentId}/submit-theory`, {
        method: 'POST',
        body: JSON.stringify({
          attemptId: attempt.id,
          answers: formattedAnswers,
        }),
      });
      setFinalResult(res);
    } catch (err: any) {
      setError(err.message || 'ส่งข้อสอบทฤษฎีไม่สำเร็จ');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <div className="p-12 text-center text-slate-500">กำลังเตรียมห้องสอบ...</div>;
  }

  if (!assessment) {
    return (
      <div className="card text-center py-12 space-y-4">
        <p className="text-red-600 font-semibold">{error || 'ไม่พบชุดข้อสอบ'}</p>
        <Link href="/assessments" className="btn-secondary">
          กลับหน้ารวมข้อสอบ
        </Link>
      </div>
    );
  }

  const examType = assessment.type || assessment.examType || 'PRACTICAL_CODING';
  const timeLimit = assessment.timeLimitMinutes ?? assessment.timeLimitMins ?? 30;

  // Final Result View
  if (finalResult) {
    const effectiveScore =
      finalResult.finalScore ?? finalResult.percentage ?? finalResult.score ?? null;
    return (
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="card space-y-4 border-emerald-200">
          <div className="flex items-center justify-between">
            <span className="badge bg-emerald-100 text-emerald-800">ส่งข้อสอบเรียบร้อยแล้ว</span>
            <span className="text-xs text-slate-500">
              สถานะ: {finalResult.status} ({finalResult.reviewStatus || finalResult.gradingStatus || 'COMPLETED'})
            </span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900">{assessment.title}</h1>

          {effectiveScore !== null && effectiveScore !== undefined ? (
            <div className="p-5 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between">
              <div>
                <div className="text-xs text-slate-500">คะแนนสุทธิ (Final Score)</div>
                <div className="text-3xl font-extrabold text-blue-700">
                  {Math.round(Number(effectiveScore))}%
                </div>
              </div>
              <div>
                {finalResult.passed ? (
                  <span className="badge bg-emerald-100 text-emerald-800 text-sm px-3 py-1">
                    ผ่านเกณฑ์มาตรฐาน (PASSED)
                  </span>
                ) : (
                  <span className="badge bg-red-100 text-red-700 text-sm px-3 py-1">
                    ยังไม่ผ่านเกณฑ์ ({assessment.passingScore}%)
                  </span>
                )}
              </div>
            </div>
          ) : (
            <div className="p-5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-sm">
              ข้อสอบของบริษัทชุดนี้อยู่ระหว่างรอผู้เชี่ยวชาญของบริษัทตรวจให้คะแนน (PENDING_HUMAN_REVIEW)
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <Link href="/profile" className="btn-primary">
              ไปที่โปรไฟล์เพื่อดูคะแนนทักษะ
            </Link>
            {applicationId ? (
              <Link href="/applications" className="btn-secondary">
                กลับหน้าใบสมัครของฉัน
              </Link>
            ) : (
              <Link href="/assessments" className="btn-secondary">
                กลับหน้ารวมข้อสอบ
              </Link>
            )}
          </div>
        </div>
      </div>
    );
  }

  const questions = assessment.questions || [];
  const currentQ = questions[activeQuestionIdx];

  return (
    <div className="space-y-6">
      <div className="card flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="badge bg-blue-100 text-blue-800">{examType}</span>
            <span className="badge bg-slate-100 text-slate-700">
              เวลาสอบ {timeLimit} นาที
            </span>
            {remainingSeconds !== null && (
              <span
                className={`badge font-mono ${
                  remainingSeconds <= 300
                    ? 'bg-red-100 text-red-700'
                    : 'bg-emerald-100 text-emerald-800'
                }`}
              >
                ⏱️ เหลือเวลา {String(Math.floor(remainingSeconds / 60)).padStart(2, '0')}:
                {String(remainingSeconds % 60).padStart(2, '0')}
              </span>
            )}
          </div>
          <h1 className="text-xl font-bold text-slate-900 mt-1">{assessment.title}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={handleAutosave} className="btn-secondary text-xs">
            บันทึกฉบับร่าง (Autosave)
          </button>
          {examType === 'THEORY' ? (
            <button
              onClick={handleSubmitTheory}
              disabled={submitting}
              className="btn-primary text-xs"
            >
              {submitting ? 'กำลังส่งคำตอบ...' : 'ยืนยันส่งข้อสอบทฤษฎี'}
            </button>
          ) : (
            <button
              onClick={handleFinalizeCoding}
              disabled={submitting}
              className="btn-primary text-xs"
            >
              {submitting ? 'กำลังประมวลผลคะแนน...' : 'ยืนยันส่งข้อสอบปฏิบัติ (Finalize)'}
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
          {error}
        </div>
      )}

      {examType === 'THEORY' ? (
        <div className="space-y-4">
          {questions.map((q: any, idx: number) => {
            const choices = Array.isArray(q.choices)
              ? q.choices
              : (q.options || []).map((opt: string, i: number) => ({
                  id: String(i),
                  text: opt,
                }));
            return (
              <div key={q.id} className="card space-y-3">
                <div className="font-bold text-slate-900">
                  ข้อที่ {idx + 1}: {q.prompt}
                </div>
                <div className="space-y-2">
                  {choices.map((c: any) => (
                    <label
                      key={c.id}
                      className="flex items-center gap-3 p-3 rounded-lg border border-slate-200 hover:bg-slate-50 cursor-pointer text-sm"
                    >
                      <input
                        type="radio"
                        name={`q-${q.id}`}
                        checked={theoryAnswers[q.id] === String(c.id)}
                        onChange={() =>
                          setTheoryAnswers((prev) => ({
                            ...prev,
                            [q.id]: String(c.id),
                          }))
                        }
                      />
                      <span>{c.text}</span>
                    </label>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Question Selector & Prompt */}
          <div className="card space-y-4">
            <div className="flex flex-wrap gap-2">
              {questions.map((q: any, idx: number) => (
                <button
                  key={q.id}
                  onClick={() => setActiveQuestionIdx(idx)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${
                    activeQuestionIdx === idx
                      ? 'bg-blue-600 text-white'
                      : submittedQuestions[q.id]
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-slate-100 text-slate-700'
                  }`}
                >
                  ข้อ {idx + 1} {submittedQuestions[q.id] ? '✓' : ''}
                </button>
              ))}
            </div>

            {currentQ && (
              <div className="space-y-3">
                <h2 className="font-bold text-slate-900">
                  โจทย์ข้อที่ {activeQuestionIdx + 1}: {currentQ.title}
                </h2>
                <p className="text-sm text-slate-700 whitespace-pre-line">{currentQ.prompt}</p>

                {currentQ.testCases?.length > 0 && (
                  <div className="space-y-2 pt-2">
                    <div className="text-xs font-semibold text-slate-500">
                      ตัวอย่างชุดทดสอบที่เปิดเผย (Visible Test Cases):
                    </div>
                    {currentQ.testCases
                      .filter((tc: any) => !tc.isHidden)
                      .map((tc: any, i: number) => (
                        <div
                          key={i}
                          className="p-2.5 rounded bg-slate-50 border border-slate-200 font-mono text-xs space-y-1 overflow-x-auto"
                        >
                          <div>Input: {tc.input}</div>
                          <div>Expected: {tc.expectedOutput}</div>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Code Editor & Runner */}
          <div className="lg:col-span-2 card space-y-4">
            {currentQ && (
              <>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <span className="text-sm font-bold text-slate-800">
                    Code Editor (JavaScript / Node.js Sandbox)
                  </span>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => handleRunVisibleTests(currentQ.id)}
                      disabled={runningCode}
                      className="btn-secondary text-xs"
                    >
                      {runningCode ? 'กำลังรันทดสอบ...' : '▶ รันทดสอบ Visible Test Cases'}
                    </button>
                    <button
                      onClick={() => handleSubmitQuestionCode(currentQ.id)}
                      disabled={submitting}
                      className="btn-primary text-xs"
                    >
                      {submitting ? 'กำลังตรวจ...' : 'บันทึกและส่งคำตอบข้อนี้'}
                    </button>
                  </div>
                </div>

                <textarea
                  rows={14}
                  className="w-full font-mono text-sm p-4 rounded-xl bg-slate-900 text-slate-100 border border-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={codeDrafts[currentQ.id] || ''}
                  onChange={(e) =>
                    setCodeDrafts((prev) => ({ ...prev, [currentQ.id]: e.target.value }))
                  }
                />

                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-slate-700">
                    คำอธิบายแนวคิดการเขียนโค้ด (Candidate Explanation — ส่งประกอบการประเมินผลด้วย AI)
                  </label>
                  <textarea
                    rows={2}
                    placeholder="อธิบายแนวคิด Time/Space Complexity หรือเหตุผลในการออกแบบโค้ดของคุณ (ไม่บังคับ)..."
                    className="w-full text-xs p-3 rounded-xl bg-white text-slate-800 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={explanations[currentQ.id] || ''}
                    onChange={(e) =>
                      setExplanations((prev) => ({ ...prev, [currentQ.id]: e.target.value }))
                    }
                  />
                </div>

                {runResult && (
                  <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2 text-xs">
                    {runResult.mode === 'OPEN_ENDED' ? (
                      <div className="space-y-1 font-mono">
                        <div className="font-bold text-slate-900">
                          สถานะการรัน: {runResult.statusDescription}
                        </div>
                        {runResult.stdout && <div>Stdout: {runResult.stdout}</div>}
                        {runResult.stderr && (
                          <div className="text-red-700">Stderr: {runResult.stderr}</div>
                        )}
                      </div>
                    ) : (
                      <>
                        <div className="font-bold text-slate-900">
                          ผลรันชุดทดสอบตัวอย่าง: ผ่าน {runResult.passedCount}/
                          {runResult.totalVisibleCount ?? runResult.totalCount ?? 0} ข้อ
                        </div>
                        {(runResult.results || []).map((r: any, idx: number) => (
                          <div
                            key={idx}
                            className={`p-2 rounded border ${
                              r.passed
                                ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                                : 'bg-red-50 border-red-200 text-red-900'
                            }`}
                          >
                            Test #{idx + 1}:{' '}
                            {r.passed ? 'PASSED' : `FAILED (Actual: ${r.actualOutput})`}
                          </div>
                        ))}
                      </>
                    )}
                  </div>
                )}

                {submittedQuestions[currentQ.id] && (
                  <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-900">
                    บันทึกคำตอบข้อนี้แล้ว • กดปุ่ม &ldquo;ยืนยันส่งข้อสอบปฏิบัติ (Finalize)&rdquo; ด้านบนเมื่อทำครบทุกข้อ
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
