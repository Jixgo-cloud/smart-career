'use client';

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';

export default function AssessmentsCatalogPage() {
  const { user } = useAuth();
  const [assessments, setAssessments] = useState<any[]>([]);
  const [attempts, setAttempts] = useState<any[]>([]);
  const [badges, setBadges] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [reviewDetail, setReviewDetail] = useState<any | null>(null);
  const [reviewLoadingId, setReviewLoadingId] = useState<string | null>(null);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string>('');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const list = await apiFetch<any[]>('/assessments');
      setAssessments(list || []);
      if (user?.role === 'CANDIDATE') {
        const [att, bdg] = await Promise.all([
          apiFetch<any[]>('/assessments/my-attempts').catch(() => []),
          apiFetch<any[]>('/assessments/my-badges').catch(() => []),
        ]);
        setAttempts(att || []);
        setBadges(bdg || []);
      }
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleOpenReview = async (attemptId: string) => {
    setReviewLoadingId(attemptId);
    setActionMessage('');
    try {
      const detail = await apiFetch<any>(`/assessments/attempts/${attemptId}/review`);
      setReviewDetail(detail);
    } catch (err: any) {
      setActionMessage(err?.message || 'ไม่สามารถโหลดผลวิเคราะห์การสอบได้');
    } finally {
      setReviewLoadingId(null);
    }
  };

  const handleRetryEvaluation = async (attemptId: string) => {
    setRetryingId(attemptId);
    setActionMessage('');
    try {
      const updated = await apiFetch<any>(
        `/assessments/attempts/${attemptId}/retry-evaluation`,
        { method: 'POST' },
      );
      setActionMessage('ส่งคำขอประเมินผลซ้ำเรียบร้อยแล้ว');
      await loadData();
      if (reviewDetail?.id === attemptId) {
        setReviewDetail(updated);
      }
    } catch (err: any) {
      setActionMessage(err?.message || 'ไม่สามารถประเมินผลซ้ำได้ในขณะนี้');
    } finally {
      setRetryingId(null);
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">ศูนย์สอบมาตรฐานกลาง (Skill Assessments)</h1>
      </div>

      {/* Earned Badges */}
      {badges.length > 0 && (
        <div className="card space-y-3 bg-gradient-to-r from-amber-50 to-yellow-50 border-amber-200">
          <h2 className="text-lg font-bold text-amber-900">🏅 เหรียญรับรองทักษะที่คุณได้รับ (Verified Skill Badges)</h2>
          <div className="flex flex-wrap gap-3">
            {badges.map((b: any, idx: number) => (
              <div
                key={b.id || b.skillId || idx}
                className="bg-white px-4 py-2.5 rounded-xl border border-amber-300 shadow-sm flex items-center gap-3"
              >
                <span className="text-xl">🎖️</span>
                <div>
                  <div className="font-bold text-slate-900 text-sm">
                    {b.badgeName || b.title || b.skillName || b.skill?.name}
                  </div>
                  <div className="text-xs text-slate-600">
                    {b.skill?.name || b.skillName} • ระดับ {b.level || 'VERIFIED'} • คะแนน{' '}
                    {b.score}%
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Assessments Catalog */}
      <div className="space-y-4">
        <h2 className="text-lg font-bold text-slate-900">รายการแบบทดสอบมาตรฐานที่เปิดให้สอบ</h2>
        {loading ? (
          <div className="p-10 text-center text-slate-500">กำลังโหลดรายการแบบทดสอบ...</div>
        ) : (
          <div className="grid md:grid-cols-2 gap-6">
            {assessments.map((exam) => {
              const examType = exam.type || exam.examType || exam.assessmentRole || 'PRACTICAL_CODING';
              const isPractical = examType === 'PRACTICAL_CODING';
              const timeLimit = exam.timeLimitMinutes ?? exam.timeLimitMins ?? 30;
              return (
                <div
                  key={exam.id}
                  className="card flex flex-col justify-between space-y-4 hover:border-blue-400 transition"
                >
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span
                          className={`badge ${
                            isPractical
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-indigo-100 text-indigo-800'
                          }`}
                        >
                          {isPractical
                            ? 'สอบปฏิบัติ (อัปเดต Global Skill Score)'
                            : 'สอบทฤษฎี (ความรู้ประกอบ)'}
                        </span>
                        <span className="badge bg-slate-100 text-slate-700">{examType}</span>
                      </div>
                      <span className="text-xs text-slate-500 font-medium">
                        ⏱️ {timeLimit} นาที • เกณฑ์ผ่าน {exam.passingScore}%
                      </span>
                    </div>

                    <h3 className="text-lg font-bold text-slate-900">{exam.title}</h3>
                    <p className="text-sm text-slate-600">{exam.description}</p>
                    <div className="text-xs text-slate-500">
                      ทักษะที่วัดผล:{' '}
                      <span className="font-semibold text-slate-800">{exam.skill?.name}</span> •{' '}
                      การแสดงผลเฉลย: {exam.feedbackVisibility}
                    </div>
                  </div>

                  <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs text-slate-500">
                      โหมดตรวจ: {exam.gradingMode || (exam.companyId ? 'COMPANY_CUSTOM' : 'PLATFORM_AUTOMATED')}
                    </span>
                    <Link href={`/assessments/${exam.id}`} className="btn-primary text-xs">
                      เริ่มทำแบบทดสอบ →
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Attempt History */}
      {attempts.length > 0 && (
        <div className="card space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-bold text-slate-900">ประวัติการเข้าสอบของฉัน</h2>
            {actionMessage && (
              <span className="text-xs font-medium text-blue-700 bg-blue-50 px-3 py-1 rounded-full">
                {actionMessage}
              </span>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-slate-600">
                  <th className="py-2.5 px-3">ชื่อชุดข้อสอบ</th>
                  <th className="py-2.5 px-3">ทักษะ</th>
                  <th className="py-2.5 px-3">สถานะ</th>
                  <th className="py-2.5 px-3">คะแนนสุทธิ (Final Score)</th>
                  <th className="py-2.5 px-3">ผลสอบ</th>
                  <th className="py-2.5 px-3">วันที่สอบ</th>
                  <th className="py-2.5 px-3 text-right">การดำเนินการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {attempts.map((a: any) => {
                  const effectiveScore = a.finalScore ?? a.percentage ?? a.score ?? null;
                  const canRetry =
                    a.reviewStatus === 'EVALUATION_PENDING' ||
                    a.reviewStatus === 'EVALUATION_FAILED';
                  return (
                    <tr key={a.id} className="hover:bg-slate-50">
                      <td className="py-2.5 px-3 font-medium text-slate-900">
                        {a.assessment?.title}
                      </td>
                      <td className="py-2.5 px-3">{a.assessment?.skill?.name}</td>
                      <td className="py-2.5 px-3">
                        <span className="badge bg-slate-100 text-slate-700">{a.status}</span>
                      </td>
                      <td className="py-2.5 px-3 font-mono font-bold">
                        {effectiveScore !== null && effectiveScore !== undefined
                          ? `${Math.round(Number(effectiveScore))}%`
                          : 'รอตรวจ'}
                      </td>
                      <td className="py-2.5 px-3">
                        {a.passed === true ? (
                          <span className="badge bg-emerald-100 text-emerald-800">ผ่านเกณฑ์</span>
                        ) : a.passed === false ? (
                          <span className="badge bg-red-100 text-red-700">ไม่ผ่านเกณฑ์</span>
                        ) : (
                          <span className="badge bg-amber-100 text-amber-800">รอผลตรวจ</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-xs text-slate-500">
                        {new Date(a.completedAt || a.startedAt).toLocaleString('th-TH')}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <div className="inline-flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleOpenReview(a.id)}
                            disabled={reviewLoadingId === a.id}
                            className="px-3 py-1 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 text-xs font-semibold transition"
                          >
                            {reviewLoadingId === a.id ? 'กำลังโหลด...' : 'ดูผลวิเคราะห์ / เฉลย'}
                          </button>
                          {canRetry && (
                            <button
                              type="button"
                              onClick={() => handleRetryEvaluation(a.id)}
                              disabled={retryingId === a.id}
                              className="px-3 py-1 rounded-lg bg-amber-100 text-amber-900 hover:bg-amber-200 text-xs font-semibold transition"
                            >
                              {retryingId === a.id ? 'กำลังตรวจซ้ำ...' : 'ประเมินผลซ้ำ (Retry AI)'}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Attempt Review Modal (GET /assessments/attempts/:attemptId/review) */}
      {reviewDetail && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white rounded-2xl max-w-3xl w-full max-h-[88vh] overflow-y-auto shadow-xl border border-slate-200 p-4 sm:p-6 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 border-b border-slate-100 pb-4">
              <div>
                <span className="badge bg-blue-50 text-blue-700">
                  {reviewDetail.assessment?.type || 'ASSESSMENT'} • การแสดงผล:{' '}
                  {reviewDetail.feedbackVisibility}
                </span>
                <h3 className="text-lg font-bold text-slate-900 mt-1">
                  ผลวิเคราะห์การสอบ: {reviewDetail.assessment?.title}
                </h3>
                <p className="text-xs text-slate-500">
                  ทักษะ: {reviewDetail.assessment?.skill?.name || '-'} • เวลาที่ใช้:{' '}
                  {reviewDetail.timeSpentSeconds
                    ? `${Math.max(1, Math.round(reviewDetail.timeSpentSeconds / 60))} นาที`
                    : '-'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setReviewDetail(null)}
                className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-xs font-semibold text-slate-700"
              >
                ปิดหน้าต่าง ✕
              </button>
            </div>

            {reviewDetail.feedbackHidden ? (
              <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 space-y-1">
                <div className="font-bold">ยังไม่เปิดเผยผลวิเคราะห์รายข้อสำหรับรอบสอบนี้</div>
                <div>
                  สถานะการตรวจ: <span className="font-semibold">{reviewDetail.reviewStatus}</span> •
                  นโยบายการแสดงผล:{' '}
                  <span className="font-semibold">{reviewDetail.feedbackVisibility}</span>
                </div>
              </div>
            ) : (
              <>
                <div className="grid sm:grid-cols-3 gap-3">
                  <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                    <div className="text-xs text-slate-500">คะแนนสุทธิ</div>
                    <div className="text-2xl font-extrabold text-blue-700">
                      {reviewDetail.percentage !== null && reviewDetail.percentage !== undefined
                        ? `${Math.round(Number(reviewDetail.percentage))}%`
                        : '-'}
                    </div>
                  </div>
                  <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                    <div className="text-xs text-slate-500">คะแนนดิบ</div>
                    <div className="text-lg font-bold text-slate-900">
                      {reviewDetail.score ?? 0} / {reviewDetail.maxScore ?? 100} คะแนน
                    </div>
                  </div>
                  <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                    <div className="text-xs text-slate-500">ผลการประเมิน</div>
                    <div className="mt-1">
                      {reviewDetail.passed ? (
                        <span className="badge bg-emerald-100 text-emerald-800">
                          ผ่านเกณฑ์ (≥{reviewDetail.assessment?.passingScore ?? 70}%)
                        </span>
                      ) : (
                        <span className="badge bg-red-100 text-red-700">
                          ไม่ผ่านเกณฑ์ (เกณฑ์ {reviewDetail.assessment?.passingScore ?? 70}%)
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {(reviewDetail.evaluationSnapshot?.summary ||
                  reviewDetail.evaluationSnapshot?.reviewFeedback ||
                  reviewDetail.reviewReason) && (
                  <div className="p-4 rounded-xl bg-indigo-50/70 border border-indigo-200 space-y-2 text-xs">
                    <div className="font-bold text-indigo-950">
                      ข้อเสนอแนะและผลวิเคราะห์จากระบบ / ผู้ตรวจ (Evaluation Feedback)
                    </div>
                    {reviewDetail.evaluationSnapshot?.summary && (
                      <p className="text-slate-700 leading-relaxed">
                        {reviewDetail.evaluationSnapshot.summary}
                      </p>
                    )}
                    {reviewDetail.evaluationSnapshot?.reviewFeedback && (
                      <p className="text-slate-700 leading-relaxed">
                        ความเห็นผู้เชี่ยวชาญ: {reviewDetail.evaluationSnapshot.reviewFeedback}
                      </p>
                    )}
                    {reviewDetail.reviewReason && (
                      <p className="text-slate-600">
                        หมายเหตุการปรับคะแนน: {reviewDetail.reviewReason}
                      </p>
                    )}
                  </div>
                )}

                {Array.isArray(reviewDetail.answers) && reviewDetail.answers.length > 0 && (
                  <div className="space-y-3">
                    <h4 className="font-bold text-sm text-slate-900">
                      รายละเอียดคำตอบรายข้อ ({reviewDetail.answers.length} ข้อ)
                    </h4>
                    <div className="space-y-2.5">
                      {reviewDetail.answers.map((ans: any, idx: number) => (
                        <div
                          key={ans.id || idx}
                          className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/70 space-y-2 text-xs"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-slate-800">ข้อที่ {idx + 1}</span>
                            <div className="flex items-center gap-2">
                              {ans.pointsEarned !== null && ans.pointsEarned !== undefined && (
                                <span className="font-mono font-semibold text-slate-700">
                                  ได้ {ans.pointsEarned} คะแนน
                                </span>
                              )}
                              {ans.isCorrect === true ? (
                                <span className="badge bg-emerald-100 text-emerald-800">
                                  ถูกต้อง / ผ่านเกณฑ์
                                </span>
                              ) : ans.isCorrect === false ? (
                                <span className="badge bg-red-100 text-red-700">ไม่ผ่าน</span>
                              ) : null}
                            </div>
                          </div>

                          {ans.submittedCode && (
                            <pre className="p-3 rounded-lg bg-slate-900 text-slate-100 font-mono text-[11px] overflow-x-auto">
                              {ans.submittedCode}
                            </pre>
                          )}

                          {ans.executionResult?.candidateExplanation && (
                            <div className="text-slate-600">
                              <span className="font-semibold text-slate-800">
                                คำอธิบายแนวคิดที่ส่ง:{' '}
                              </span>
                              {ans.executionResult.candidateExplanation}
                            </div>
                          )}

                          {ans.executionResult?.aiEvaluation?.summary && (
                            <div className="p-2.5 rounded bg-white border border-slate-200 text-slate-700">
                              <span className="font-semibold text-blue-700">AI Feedback: </span>
                              {ans.executionResult.aiEvaluation.summary}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
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
