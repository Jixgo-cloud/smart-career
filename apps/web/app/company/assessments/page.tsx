'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { apiFetch } from '@/lib/api';

interface QuestionDraft {
  title: string;
  prompt: string;
  difficulty: string;
  points: number;
  starterCode: string;
  rubricText: string;
}

export default function CompanyAssessmentsPage() {
  const [assessments, setAssessments] = useState<any[]>([]);
  const [masterSkills, setMasterSkills] = useState<any[]>([]);
  const [selectedAssessmentId, setSelectedAssessmentId] = useState<string | null>(null);
  const [attempts, setAttempts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  // Create / Edit assessment form
  const [editingAssessmentId, setEditingAssessmentId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [skillId, setSkillId] = useState('');
  const [timeLimitMinutes, setTimeLimitMinutes] = useState(45);
  const [passingScore, setPassingScore] = useState(70);
  const [feedbackVisibility, setFeedbackVisibility] = useState('AFTER_REVIEW');
  const [questions, setQuestions] = useState<QuestionDraft[]>([
    {
      title: '',
      prompt: '',
      difficulty: 'MEDIUM',
      points: 100,
      starterCode: '// เขียนคำตอบสำหรับโจทย์ของบริษัทที่นี่\n',
      rubricText: '',
    },
  ]);

  // Override score form
  const [humanScore, setHumanScore] = useState<Record<string, number>>({});
  const [reviewReason, setReviewReason] = useState<Record<string, string>>({});
  const [reviewFeedback, setReviewFeedback] = useState<Record<string, string>>({});

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [ass, sk] = await Promise.all([
        apiFetch<any[]>('/company/assessments'),
        apiFetch<any[]>('/skills'),
      ]);
      setAssessments(ass || []);
      setMasterSkills(sk || []);
      if (sk?.length > 0 && !skillId) setSkillId(sk[0].id);
      if (ass?.length > 0 && !selectedAssessmentId) {
        setSelectedAssessmentId(ass[0].id);
      }
    } finally {
      setLoading(false);
    }
  }, [skillId, selectedAssessmentId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (!selectedAssessmentId) return;
    apiFetch<any[]>(`/company/assessments/${selectedAssessmentId}/attempts`)
      .then((res) => setAttempts(res || []))
      .catch(() => setAttempts([]));
  }, [selectedAssessmentId]);

  const resetForm = () => {
    setEditingAssessmentId(null);
    setTitle('');
    setDescription('');
    setTimeLimitMinutes(45);
    setPassingScore(70);
    setFeedbackVisibility('AFTER_REVIEW');
    setQuestions([
      {
        title: '',
        prompt: '',
        difficulty: 'MEDIUM',
        points: 100,
        starterCode: '// เขียนคำตอบสำหรับโจทย์ของบริษัทที่นี่\n',
        rubricText: '',
      },
    ]);
  };

  const handleEditAssessment = (exam: any) => {
    setEditingAssessmentId(exam.id);
    setTitle(exam.title || '');
    setDescription(exam.description || '');
    setSkillId(exam.skillId || masterSkills[0]?.id || '');
    setTimeLimitMinutes(Number(exam.timeLimitMinutes ?? 45));
    setPassingScore(Number(exam.passingScore ?? 70));
    setFeedbackVisibility(exam.feedbackVisibility || 'AFTER_REVIEW');
    if (Array.isArray(exam.questions) && exam.questions.length > 0) {
      setQuestions(
        exam.questions.map((q: any) => ({
          title: q.title || '',
          prompt: q.prompt || '',
          difficulty: q.difficulty || 'MEDIUM',
          points: Number(q.points ?? 100),
          starterCode: q.starterCode || '// เขียนคำตอบสำหรับโจทย์ของบริษัทที่นี่\n',
          rubricText:
            typeof q.rubric === 'string'
              ? q.rubric
              : q.rubric?.customGuidelines || '',
        })),
      );
    }
  };

  const handleSaveAssessment = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage('');
    setError('');
    try {
      const payload = {
        title,
        description: description.trim() || null,
        skillId,
        type: 'PRACTICAL_CODING',
        timeLimitMinutes: Number(timeLimitMinutes),
        passingScore: Number(passingScore),
        feedbackVisibility,
        questions: questions.map((q, idx) => ({
          title: q.title.trim() || `${title} - Q${idx + 1}`,
          prompt: q.prompt,
          difficulty: q.difficulty || 'MEDIUM',
          evaluationMethod: 'OPEN_ENDED',
          points: Number(q.points || 100),
          starterCode: q.starterCode || '// เขียนคำตอบสำหรับโจทย์ของบริษัทที่นี่\n',
          rubric: q.rubricText.trim()
            ? { customGuidelines: q.rubricText.trim() }
            : null,
        })),
      };

      if (editingAssessmentId) {
        await apiFetch(`/company/assessments/${editingAssessmentId}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        setMessage('บันทึกการแก้ไขชุดข้อสอบของบริษัทเรียบร้อยแล้ว');
      } else {
        await apiFetch('/company/assessments', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        setMessage('สร้างชุดข้อสอบของบริษัทเรียบร้อยแล้ว (โหมดตรวจ: COMPANY_MANUAL)');
      }

      resetForm();
      await loadData();
    } catch (err: any) {
      setError(err.message || 'บันทึกชุดข้อสอบไม่สำเร็จ');
    }
  };

  const handleToggleAssessment = async (examId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setMessage('');
    setError('');
    try {
      await apiFetch(`/company/assessments/${examId}/toggle`, { method: 'PATCH' });
      await loadData();
    } catch (err: any) {
      setError(err.message || 'เปลี่ยนสถานะข้อสอบไม่สำเร็จ');
    }
  };

  const handleDeleteAssessment = async (examId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setMessage('');
    setError('');
    try {
      await apiFetch(`/company/assessments/${examId}`, { method: 'DELETE' });
      if (selectedAssessmentId === examId) {
        setSelectedAssessmentId(null);
      }
      setMessage('ลบชุดข้อสอบของบริษัทเรียบร้อยแล้ว');
      await loadData();
    } catch (err: any) {
      setError(err.message || 'ไม่สามารถลบชุดข้อสอบที่มีผู้เข้าสอบแล้วได้');
    }
  };

  const handleOverrideScore = async (attemptId: string) => {
    setMessage('');
    setError('');
    try {
      await apiFetch(`/assessments/attempts/${attemptId}/override-score`, {
        method: 'POST',
        body: JSON.stringify({
          humanScore: Number(humanScore[attemptId] ?? 85),
          reviewReason:
            reviewReason[attemptId] ||
            'ตรวจโครงสร้างโค้ดและวิธีแก้ปัญหาโดยผู้เชี่ยวชาญของบริษัทแล้ว',
          reviewFeedback: reviewFeedback[attemptId]?.trim() || undefined,
        }),
      });
      setMessage('บันทึกคะแนนตรวจโดยผู้เชี่ยวชาญของบริษัท (Human Score) เรียบร้อยแล้ว');
      if (selectedAssessmentId) {
        const res = await apiFetch<any[]>(
          `/company/assessments/${selectedAssessmentId}/attempts`,
        );
        setAttempts(res || []);
      }
    } catch (err: any) {
      setError(err.message || 'บันทึกคะแนนไม่สำเร็จ');
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">
          จัดการข้อสอบคัดเลือกของบริษัทและตรวจให้คะแนน (Company Manual Review)
        </h1>
      </div>

      {message && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm">
          {message}
        </div>
      )}
      {error && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Create / Edit Company Assessment */}
        <form onSubmit={handleSaveAssessment} className="card space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-bold text-slate-900">
              {editingAssessmentId
                ? 'แก้ไขชุดข้อสอบของบริษัท'
                : 'สร้างชุดข้อสอบเฉพาะของบริษัท'}
            </h2>
            {editingAssessmentId && (
              <button
                type="button"
                onClick={resetForm}
                className="btn-secondary text-xs"
              >
                ยกเลิกการแก้ไข
              </button>
            )}
          </div>

          <div>
            <label className="label">ชื่อชุดข้อสอบ</label>
            <input
              type="text"
              className="input"
              placeholder="เช่น Backend Architecture & API Challenge"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </div>

          <div>
            <label className="label">คำอธิบายชุดข้อสอบ</label>
            <input
              type="text"
              className="input"
              placeholder="อธิบายวัตถุประสงค์ของแบบทดสอบ..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="label">ทักษะหลักที่เกี่ยวข้อง</label>
              <select
                className="input text-xs"
                value={skillId}
                onChange={(e) => setSkillId(e.target.value)}
              >
                {masterSkills.map((sk) => (
                  <option key={sk.id} value={sk.id}>
                    {sk.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">การแสดงผลลัพธ์ให้ผู้สมัคร</label>
              <select
                className="input text-xs"
                value={feedbackVisibility}
                onChange={(e) => setFeedbackVisibility(e.target.value)}
              >
                <option value="AFTER_REVIEW">หลังผู้เชี่ยวชาญตรวจ (AFTER_REVIEW)</option>
                <option value="IMMEDIATE">แสดงผลทันที (IMMEDIATE)</option>
                <option value="PRIVATE_TO_COMPANY">เฉพาะบริษัทเห็น (PRIVATE_TO_COMPANY)</option>
              </select>
            </div>
            <div>
              <label className="label">เวลาสอบ (นาที)</label>
              <input
                type="number"
                min={5}
                max={240}
                className="input text-xs"
                value={timeLimitMinutes}
                onChange={(e) => setTimeLimitMinutes(Number(e.target.value))}
              />
            </div>
            <div>
              <label className="label">เกณฑ์คะแนนผ่าน (%)</label>
              <input
                type="number"
                min={1}
                max={100}
                className="input text-xs"
                value={passingScore}
                onChange={(e) => setPassingScore(Number(e.target.value))}
              />
            </div>
          </div>

          <div className="space-y-3 pt-2 border-t border-slate-100">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="label mb-0">รายการโจทย์ปัญหา ({questions.length} ข้อ)</label>
              <button
                type="button"
                onClick={() =>
                  setQuestions((prev) => [
                    ...prev,
                    {
                      title: '',
                      prompt: '',
                      difficulty: 'MEDIUM',
                      points: 100,
                      starterCode: '// เขียนคำตอบสำหรับโจทย์ของบริษัทที่นี่\n',
                      rubricText: '',
                    },
                  ])
                }
                className="btn-secondary text-xs"
              >
                + เพิ่มข้อคำถาม
              </button>
            </div>

            {questions.map((q, idx) => (
              <div
                key={idx}
                className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-2"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700">ข้อที่ {idx + 1}</span>
                  {questions.length > 1 && (
                    <button
                      type="button"
                      onClick={() =>
                        setQuestions((prev) => prev.filter((_, i) => i !== idx))
                      }
                      className="text-xs text-red-600 hover:underline"
                    >
                      ลบข้อนี้
                    </button>
                  )}
                </div>

                <div>
                  <label className="label text-xs">โจทย์ปัญหา (Open-Ended / Coding Challenge Prompt)</label>
                  <textarea
                    rows={3}
                    className="input text-xs"
                    placeholder="อธิบายโจทย์และเกณฑ์การให้คะแนน..."
                    value={q.prompt}
                    onChange={(e) =>
                      setQuestions((prev) =>
                        prev.map((item, i) =>
                          i === idx ? { ...item, prompt: e.target.value } : item,
                        ),
                      )
                    }
                    required
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <label className="label text-xs">โค้ดเริ่มต้น (Starter Code)</label>
                    <input
                      type="text"
                      className="input text-xs font-mono"
                      value={q.starterCode}
                      onChange={(e) =>
                        setQuestions((prev) =>
                          prev.map((item, i) =>
                            i === idx ? { ...item, starterCode: e.target.value } : item,
                          ),
                        )
                      }
                    />
                  </div>
                  <div>
                    <label className="label text-xs">เกณฑ์การตรวจ (Rubric)</label>
                    <input
                      type="text"
                      className="input text-xs"
                      placeholder="เช่น ความถูกต้องของโครงสร้างโค้ด"
                      value={q.rubricText}
                      onChange={(e) =>
                        setQuestions((prev) =>
                          prev.map((item, i) =>
                            i === idx ? { ...item, rubricText: e.target.value } : item,
                          ),
                        )
                      }
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          <button type="submit" className="btn-primary w-full">
            {editingAssessmentId
              ? 'บันทึกการแก้ไขชุดข้อสอบ'
              : '+ สร้างชุดข้อสอบของบริษัท'}
          </button>
        </form>

        {/* List Company Assessments */}
        <div className="card space-y-4">
          <h2 className="text-lg font-bold text-slate-900">
            ชุดข้อสอบของบริษัท ({assessments.length})
          </h2>
          <div className="space-y-2">
            {assessments.map((a) => {
              const attemptCount = a._count?.attempts || 0;
              return (
                <div
                  key={a.id}
                  onClick={() => setSelectedAssessmentId(a.id)}
                  className={`p-3.5 rounded-xl border cursor-pointer transition space-y-2 ${
                    selectedAssessmentId === a.id
                      ? 'border-blue-500 bg-blue-50/40'
                      : 'border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="font-bold text-slate-900 text-sm flex flex-wrap items-center gap-2">
                        {a.title}
                        <span
                          className={`badge text-[10px] ${
                            a.isActive
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-slate-200 text-slate-700'
                          }`}
                        >
                          {a.isActive ? 'เปิดใช้งาน' : 'ปิดใช้งาน'}
                        </span>
                      </div>
                      <div className="text-xs text-slate-500">
                        ทักษะ: {a.skill?.name || '-'} • โหมดตรวจ:{' '}
                        {a.gradingMode || 'COMPANY_MANUAL'} • เวลา {a.timeLimitMinutes} นาที (ผ่าน{' '}
                        {a.passingScore}%)
                      </div>
                    </div>
                    <span className="badge bg-blue-100 text-blue-800 shrink-0">
                      ผู้เข้าสอบ {attemptCount} คน
                    </span>
                  </div>

                  <div className="flex items-center gap-2 pt-1 flex-wrap">
                    <div className="btn-segmented-group">
                      {attemptCount === 0 && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleEditAssessment(a);
                          }}
                          className="btn-segmented-item py-1.5 px-2.5 hover:text-blue-600"
                        >
                          <svg
                            className="w-3.5 h-3.5 text-blue-600 shrink-0"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden="true"
                          >
                            <path d="M12 20h9" />
                            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                          </svg>
                          แก้ไข
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={(e) => handleToggleAssessment(a.id, e)}
                        className="btn-segmented-item py-1.5 px-2.5 bg-slate-50/60 hover:bg-slate-100"
                      >
                        <span
                          className={`w-2 h-2 rounded-full shrink-0 ${
                            a.isActive ? 'bg-amber-500' : 'bg-emerald-500'
                          }`}
                          aria-hidden="true"
                        />
                        {a.isActive ? 'ปิดใช้งาน' : 'เปิดใช้งาน'}
                      </button>
                    </div>
                    {attemptCount === 0 && (
                      <button
                        type="button"
                        onClick={(e) => handleDeleteAssessment(a.id, e)}
                        className="btn-danger text-xs py-1.5 px-2.5"
                      >
                        <svg
                          className="w-3.5 h-3.5 text-rose-500 shrink-0"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden="true"
                        >
                          <polyline points="3 6 5 6 21 6" />
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        </svg>
                        ลบ
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Candidate Attempts & Manual Override Review */}
      <div className="card space-y-4">
        <h2 className="text-lg font-bold text-slate-900">
          รายการกระดาษคำตอบของผู้สมัคร (รอตรวจ / ตรวจให้คะแนนโดยผู้เชี่ยวชาญ)
        </h2>
        {attempts.length === 0 ? (
          <p className="text-sm text-slate-500">ยังไม่มีผู้สมัครส่งคำตอบในชุดข้อสอบที่เลือก</p>
        ) : (
          <div className="space-y-4">
            {attempts.map((att) => {
              const integrityEvents = Array.isArray(att.integrityEvents)
                ? att.integrityEvents
                : [];
              return (
                <div
                  key={att.id}
                  className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-slate-900">
                        ผู้เข้าสอบ: {att.candidate?.fullName || att.user?.name || att.user?.email}
                      </span>
                      <span className="text-xs text-slate-500">
                        สถานะ: {att.status} ({att.reviewStatus || att.gradingStatus})
                      </span>
                      {integrityEvents.length > 0 && (
                        <span className="badge bg-amber-100 text-amber-800 text-[11px]">
                          ⚠️ สลับหน้าจอ/แท็บระหว่างสอบ {integrityEvents.length} ครั้ง
                        </span>
                      )}
                    </div>
                    <span className="badge bg-emerald-100 text-emerald-800">
                      คะแนนสุทธิปัจจุบัน:{' '}
                      {(att.effectivePercentage ?? att.score) !== null &&
                      (att.effectivePercentage ?? att.score) !== undefined
                        ? `${att.effectivePercentage ?? att.score}%`
                        : 'รอตรวจ'}
                    </span>
                  </div>

                  {(att.codeSubmissions || []).map((sub: any) => {
                    const exec = sub.executionResult || {};
                    return (
                      <div key={sub.id} className="space-y-2">
                        <pre className="p-3 rounded-lg bg-slate-900 text-slate-100 text-xs font-mono overflow-x-auto">
                          {sub.sourceCode}
                        </pre>
                        {(exec.stdout || exec.stderr || exec.candidateExplanation) && (
                          <div className="p-3 rounded-lg bg-white border border-slate-200 text-xs space-y-1">
                            {exec.statusDescription && (
                              <div>
                                <b>สถานะการรัน Judge0:</b> {exec.statusDescription}
                              </div>
                            )}
                            {exec.stdout && (
                              <div>
                                <b>Stdout:</b> <code className="text-emerald-700">{exec.stdout}</code>
                              </div>
                            )}
                            {exec.stderr && (
                              <div>
                                <b>Stderr:</b> <code className="text-red-600">{exec.stderr}</code>
                              </div>
                            )}
                            {exec.candidateExplanation && (
                              <div>
                                <b>คำอธิบายวิธีคิดของผู้สมัคร:</b> {exec.candidateExplanation}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end pt-2">
                    <div>
                      <label className="label">ให้คะแนนโดยผู้เชี่ยวชาญ (Human Score 0-100)</label>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        className="input text-xs"
                        value={humanScore[att.id] ?? att.score ?? 85}
                        onChange={(e) =>
                          setHumanScore((prev) => ({
                            ...prev,
                            [att.id]: Number(e.target.value),
                          }))
                        }
                      />
                    </div>
                    <div>
                      <label className="label">เหตุผลประกอบการตรวจ (Review Reason)</label>
                      <input
                        type="text"
                        className="input text-xs"
                        placeholder="ระบุความเห็นของผู้ตรวจ..."
                        value={reviewReason[att.id] ?? att.reviewReason ?? ''}
                        onChange={(e) =>
                          setReviewReason((prev) => ({
                            ...prev,
                            [att.id]: e.target.value,
                          }))
                        }
                      />
                    </div>
                    <div>
                      <label className="label">ข้อเสนอแนะถึงผู้สมัคร (Review Feedback)</label>
                      <input
                        type="text"
                        className="input text-xs"
                        placeholder="คำแนะนำเพิ่มเติม..."
                        value={reviewFeedback[att.id] ?? ''}
                        onChange={(e) =>
                          setReviewFeedback((prev) => ({
                            ...prev,
                            [att.id]: e.target.value,
                          }))
                        }
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => handleOverrideScore(att.id)}
                      className="btn-primary text-xs"
                    >
                      บันทึกคะแนนผู้เชี่ยวชาญ (Override Score)
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
