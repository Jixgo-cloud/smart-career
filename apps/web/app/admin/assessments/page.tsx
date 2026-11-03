'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { apiFetch } from '@/lib/api';
import { AdminBanner, confirmAdminAction } from '@/components/admin/ui';

interface ChoiceDraft {
  text: string;
  isCorrect: boolean;
}

interface TestCaseDraft {
  input: string;
  expectedOutput: string;
  isHidden: boolean;
}

interface QuestionDraft {
  title: string;
  prompt: string;
  difficulty: 'EASY' | 'MEDIUM' | 'HARD';
  points: number;
  explanation: string;
  starterCode: string;
  solutionCode: string;
  choices: ChoiceDraft[];
  testCases: TestCaseDraft[];
}

function createDefaultQuestion(idx: number): QuestionDraft {
  return {
    title: `ข้อที่ ${idx + 1}`,
    prompt: 'จงอธิบายแนวคิดหรือเขียนฟังก์ชันเพื่อแก้ปัญหาตามที่โจทย์กำหนด',
    difficulty: 'MEDIUM',
    points: 100,
    explanation: 'คำอธิบายแนวคิดและเหตุผลของคำตอบที่ถูกต้อง',
    starterCode: 'function solve(input) {\n  return input;\n}\n',
    solutionCode: '',
    choices: [
      { text: 'GET และ PUT มีคุณสมบัติ Idempotent ตามมาตรฐาน HTTP', isCorrect: true },
      { text: 'POST เป็นเมธอดเดียวที่ปลอดภัยและไม่มีผลข้างเคียง', isCorrect: false },
      { text: 'PATCH บังคับใช้เฉพาะการส่งข้อมูลแบบ Binary เท่านั้น', isCorrect: false },
      { text: 'DELETE ไม่สามารถส่งรหัสสถานะ 200 หรือ 204 กลับได้', isCorrect: false },
    ],
    testCases: [
      { input: '1', expectedOutput: '1', isHidden: false },
      { input: '2', expectedOutput: '2', isHidden: true },
    ],
  };
}

export default function AdminAssessmentsPage() {
  const [assessments, setAssessments] = useState<any[]>([]);
  const [skills, setSkills] = useState<any[]>([]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  // Create / Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingLockedByAttempts, setEditingLockedByAttempts] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [skillId, setSkillId] = useState('');
  const [examType, setExamType] = useState('CODING_SANDBOX');
  const [assessmentRole, setAssessmentRole] = useState('PRACTICAL_CODING');
  const [timeLimitMinutes, setTimeLimitMinutes] = useState(30);
  const [passingScore, setPassingScore] = useState(70);
  const [feedbackVisibility, setFeedbackVisibility] = useState('AFTER_REVIEW');
  const [publishImmediately, setPublishImmediately] = useState(true);
  const [questions, setQuestions] = useState<QuestionDraft[]>([createDefaultQuestion(0)]);

  // Attempts viewer state
  const [selectedExamForAttempts, setSelectedExamForAttempts] = useState<any | null>(null);
  const [attempts, setAttempts] = useState<any[]>([]);
  const [loadingAttempts, setLoadingAttempts] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [ass, sk] = await Promise.all([
        apiFetch<any[]>('/admin/assessments'),
        apiFetch<any[]>('/admin/skills'),
      ]);
      setAssessments(ass || []);
      setSkills(sk || []);
      if (sk?.length > 0 && !skillId) setSkillId(sk[0].id);
    } catch (err: any) {
      setError(err?.message || 'ไม่สามารถโหลดคลังข้อสอบกลางได้');
    } finally {
      setLoading(false);
    }
  }, [skillId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const resetForm = () => {
    setEditingId(null);
    setEditingLockedByAttempts(false);
    setTitle('');
    setDescription('');
    setExamType('CODING_SANDBOX');
    setAssessmentRole('PRACTICAL_CODING');
    setTimeLimitMinutes(30);
    setPassingScore(70);
    setFeedbackVisibility('AFTER_REVIEW');
    setPublishImmediately(true);
    setQuestions([createDefaultQuestion(0)]);
  };

  const handleStartEdit = (exam: any) => {
    setMessage('');
    setError('');
    setEditingId(exam.id);
    const hasAttempts = (exam._count?.attempts ?? 0) > 0;
    setEditingLockedByAttempts(hasAttempts);
    setTitle(exam.title || '');
    setDescription(exam.description || '');
    setSkillId(exam.skillId || skills[0]?.id || '');
    const isTheory = exam.type === 'THEORY' || exam.examType === 'THEORY';
    setExamType(isTheory ? 'THEORY' : 'CODING_SANDBOX');
    setAssessmentRole(isTheory ? 'THEORY_SYNTHESIS' : 'PRACTICAL_CODING');
    setTimeLimitMinutes(exam.timeLimitMinutes ?? 30);
    setPassingScore(exam.passingScore ?? 70);
    setFeedbackVisibility(exam.feedbackVisibility || 'AFTER_REVIEW');
    setPublishImmediately(Boolean(exam.isActive));

    if (Array.isArray(exam.questions) && exam.questions.length > 0) {
      setQuestions(
        exam.questions.map((q: any, idx: number) => ({
          title: q.title || `ข้อที่ ${idx + 1}`,
          prompt: q.prompt || '',
          difficulty: q.difficulty || 'MEDIUM',
          points: Number(q.points ?? 100),
          explanation: q.explanation || '',
          starterCode: q.starterCode || 'function solve(input) {\n  return input;\n}\n',
          solutionCode: q.solutionCode || '',
          choices:
            Array.isArray(q.choices) && q.choices.length >= 2
              ? q.choices.map((c: any) => ({
                  text: c.text || '',
                  isCorrect: Boolean(c.isCorrect),
                }))
              : createDefaultQuestion(idx).choices,
          testCases:
            Array.isArray(q.testCases) && q.testCases.length >= 2
              ? q.testCases.map((tc: any) => ({
                  input: String(tc.input ?? ''),
                  expectedOutput: String(tc.expectedOutput ?? ''),
                  isHidden: Boolean(tc.isHidden),
                }))
              : createDefaultQuestion(idx).testCases,
        })),
      );
    } else {
      setQuestions([createDefaultQuestion(0)]);
    }
  };

  const handleUpdateStatus = async (id: string, status: string) => {
    setMessage('');
    setError('');
    try {
      await apiFetch(`/admin/assessments/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      setMessage(`เปลี่ยนสถานะชุดข้อสอบเป็น ${status} แล้ว`);
      await loadData();
    } catch (err: any) {
      setError(err.message || 'เปลี่ยนสถานะไม่สำเร็จ');
    }
  };

  const handleUpdateVisibility = async (id: string, visibility: string) => {
    setMessage('');
    setError('');
    try {
      await apiFetch(`/admin/assessments/${id}/feedback-visibility`, {
        method: 'PATCH',
        body: JSON.stringify({ feedbackVisibility: visibility }),
      });
      setMessage(`อัปเดตนโยบาย Feedback Visibility เป็น ${visibility} แล้ว`);
      await loadData();
    } catch (err: any) {
      setError(err.message || 'อัปเดตไม่สำเร็จ');
    }
  };

  const handleDelete = async (exam: any) => {
    const confirmed = confirmAdminAction(
      `ยืนยันการลบชุดข้อสอบกลาง "${exam.title}" หรือไม่?`,
    );
    if (!confirmed) return;

    setMessage('');
    setError('');
    try {
      await apiFetch(`/admin/assessments/${exam.id}`, { method: 'DELETE' });
      setMessage(`ลบชุดข้อสอบ "${exam.title}" เรียบร้อยแล้ว`);
      if (editingId === exam.id) resetForm();
      await loadData();
    } catch (err: any) {
      setError(err.message || 'ไม่สามารถลบชุดข้อสอบได้');
    }
  };

  const handleViewAttempts = async (exam: any) => {
    setSelectedExamForAttempts(exam);
    setLoadingAttempts(true);
    try {
      const res = await apiFetch<any[]>(`/admin/assessments/${exam.id}/attempts`);
      setAttempts(res || []);
    } catch (err: any) {
      setError(err.message || 'ไม่สามารถโหลดประวัติการเข้าสอบได้');
      setAttempts([]);
    } finally {
      setLoadingAttempts(false);
    }
  };

  const updateQuestion = (idx: number, patch: Partial<QuestionDraft>) => {
    setQuestions((prev) =>
      prev.map((q, i) => (i === idx ? { ...q, ...patch } : q)),
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage('');
    setError('');

    try {
      const isTheory = examType === 'THEORY';
      const formattedQuestions = questions.map((q, idx) => {
        const qTitle = q.title.trim() || `${title.trim()} - Q${idx + 1}`;
        if (isTheory) {
          return {
            title: qTitle,
            prompt: q.prompt,
            difficulty: q.difficulty,
            points: Number(q.points) || 100,
            explanation: q.explanation,
            choices: q.choices.map((c, cIdx) => ({
              text: c.text,
              isCorrect: Boolean(c.isCorrect),
              order: cIdx + 1,
            })),
          };
        }
        return {
          title: qTitle,
          prompt: q.prompt,
          difficulty: q.difficulty,
          points: Number(q.points) || 100,
          starterCode: q.starterCode,
          solutionCode: q.solutionCode.trim() ? q.solutionCode : null,
          testCases: q.testCases,
        };
      });

      if (editingId) {
        const payload: Record<string, any> = {
          title,
          description: description.trim() || null,
          feedbackVisibility,
        };
        if (!editingLockedByAttempts) {
          payload.skillId = skillId;
          payload.examType = examType;
          payload.type = isTheory ? 'THEORY' : 'PRACTICAL_CODING';
          payload.timeLimitMinutes = Number(timeLimitMinutes);
          payload.passingScore = Number(passingScore);
          payload.questions = formattedQuestions;
        }
        await apiFetch(`/admin/assessments/${editingId}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        setMessage('บันทึกการแก้ไขชุดข้อสอบมาตรฐานกลางเรียบร้อยแล้ว');
      } else {
        await apiFetch('/admin/assessments', {
          method: 'POST',
          body: JSON.stringify({
            title,
            description: description.trim() || null,
            skillId,
            examType,
            type: isTheory ? 'THEORY' : 'PRACTICAL_CODING',
            assessmentRole,
            timeLimitMinutes: Number(timeLimitMinutes),
            passingScore: Number(passingScore),
            feedbackVisibility,
            status: publishImmediately ? 'PUBLISHED' : 'RETIRED',
            isActive: publishImmediately,
            questions: formattedQuestions,
          }),
        });
        setMessage('สร้างชุดข้อสอบมาตรฐานกลางเรียบร้อยแล้ว');
      }

      resetForm();
      await loadData();
    } catch (err: any) {
      setError(err.message || 'บันทึกชุดข้อสอบไม่สำเร็จ');
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">
          จัดการคลังข้อสอบมาตรฐานกลาง (Platform Assessment Governance)
        </h1>
      </div>

      <AdminBanner
        message={message}
        error={error}
        onClear={() => {
          setMessage('');
          setError('');
        }}
      />

      {/* Create / Edit Platform Exam */}
      <form onSubmit={handleSubmit} className="card space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-bold text-slate-900">
            {editingId ? 'แก้ไขชุดข้อสอบกลาง' : 'สร้างชุดข้อสอบกลางใหม่'}
          </h2>
          {editingId && (
            <button
              type="button"
              onClick={resetForm}
              className="btn-secondary text-xs"
            >
              ยกเลิกการแก้ไข
            </button>
          )}
        </div>

        {editingLockedByAttempts && (
          <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs">
            ชุดข้อสอบนี้มีผู้สมัครเข้าสอบแล้ว ระบบล็อกการแก้ไขโจทย์และเกณฑ์คะแนนเพื่อรักษาความยุติธรรม (แก้ไขได้เฉพาะชื่อ คำอธิบาย และนโยบายเปิดเผยเฉลย)
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div>
            <label className="label">ชื่อข้อสอบ</label>
            <input
              type="text"
              className="input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="label">ทักษะ</label>
            <select
              className="input"
              value={skillId}
              disabled={editingLockedByAttempts}
              onChange={(e) => setSkillId(e.target.value)}
            >
              {skills.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">ประเภทข้อสอบ (Exam Type)</label>
            <select
              className="input"
              value={examType}
              disabled={editingLockedByAttempts}
              onChange={(e) => {
                const v = e.target.value;
                setExamType(v);
                setAssessmentRole(
                  v === 'THEORY' ? 'THEORY_SYNTHESIS' : 'PRACTICAL_CODING',
                );
              }}
            >
              <option value="CODING_SANDBOX">
                CODING_SANDBOX (PRACTICAL_CODING)
              </option>
              <option value="THEORY">THEORY (THEORY_SYNTHESIS)</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
          <div>
            <label className="label">เวลาสอบ (นาที: 1–240)</label>
            <input
              type="number"
              min={1}
              max={240}
              className="input"
              disabled={editingLockedByAttempts}
              value={timeLimitMinutes}
              onChange={(e) => setTimeLimitMinutes(Number(e.target.value))}
              required
            />
          </div>
          <div>
            <label className="label">เกณฑ์ผ่าน (%: 1–100)</label>
            <input
              type="number"
              min={1}
              max={100}
              className="input"
              disabled={editingLockedByAttempts}
              value={passingScore}
              onChange={(e) => setPassingScore(Number(e.target.value))}
              required
            />
          </div>
          <div>
            <label className="label">นโยบายเปิดเผยเฉลย</label>
            <select
              className="input"
              value={feedbackVisibility}
              onChange={(e) => setFeedbackVisibility(e.target.value)}
            >
              <option value="AFTER_REVIEW">AFTER_REVIEW (SUMMARY_ONLY)</option>
              <option value="IMMEDIATE">IMMEDIATE (FULL_REVIEW)</option>
              <option value="PRIVATE_TO_COMPANY">
                PRIVATE_TO_COMPANY (SCORE_ONLY)
              </option>
            </select>
          </div>
          <div>
            <label className="label">คำอธิบายชุดข้อสอบ</label>
            <input
              type="text"
              className="input"
              placeholder="คำอธิบายเพิ่มเติม (ถ้ามี)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
        </div>

        {!editingId && (
          <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700">
            <input
              type="checkbox"
              checked={publishImmediately}
              onChange={(e) => setPublishImmediately(e.target.checked)}
            />
            เผยแพร่ให้ผู้สมัครเข้าสอบทันที (PUBLISHED) — หากไม่เลือกจะถูกสร้างในสถานะปิดใช้งาน (RETIRED)
          </label>
        )}

        {/* Questions Builder */}
        {!editingLockedByAttempts && (
          <div className="space-y-4 border-t border-slate-200 pt-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900">
                รายการโจทย์คำถาม ({questions.length} ข้อ)
              </h3>
              <button
                type="button"
                onClick={() =>
                  setQuestions((prev) => [
                    ...prev,
                    createDefaultQuestion(prev.length),
                  ])
                }
                className="btn-secondary text-xs"
              >
                + เพิ่มโจทย์คำถามข้อถัดไป
              </button>
            </div>

            {questions.map((q, qIdx) => (
              <div
                key={qIdx}
                className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-slate-700">
                    คำถามข้อที่ {qIdx + 1}
                  </span>
                  {questions.length > 1 && (
                    <button
                      type="button"
                      onClick={() =>
                        setQuestions((prev) => prev.filter((_, i) => i !== qIdx))
                      }
                      className="text-xs text-red-600 hover:underline"
                    >
                      ลบข้อนี้
                    </button>
                  )}
                </div>

                <div>
                  <label className="label">โจทย์คำถามเริ่มต้น</label>
                  <textarea
                    rows={2}
                    className="input"
                    value={q.prompt}
                    onChange={(e) =>
                      updateQuestion(qIdx, { prompt: e.target.value })
                    }
                    required
                  />
                </div>

                <div className="grid md:grid-cols-3 gap-3">
                  <div>
                    <label className="label">หัวข้อคำถาม</label>
                    <input
                      type="text"
                      className="input text-xs"
                      value={q.title}
                      onChange={(e) =>
                        updateQuestion(qIdx, { title: e.target.value })
                      }
                    />
                  </div>
                  <div>
                    <label className="label">ความยาก</label>
                    <select
                      className="input text-xs"
                      value={q.difficulty}
                      onChange={(e) =>
                        updateQuestion(qIdx, {
                          difficulty: e.target.value as any,
                        })
                      }
                    >
                      <option value="EASY">EASY</option>
                      <option value="MEDIUM">MEDIUM</option>
                      <option value="HARD">HARD</option>
                    </select>
                  </div>
                  <div>
                    <label className="label">คะแนน (Points)</label>
                    <input
                      type="number"
                      min={1}
                      max={1000}
                      className="input text-xs"
                      value={q.points}
                      onChange={(e) =>
                        updateQuestion(qIdx, { points: Number(e.target.value) })
                      }
                    />
                  </div>
                </div>

                {examType === 'THEORY' ? (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="label mb-0">
                        ตัวเลือกคำตอบ (เลือกคำตอบที่ถูกต้อง 1 ข้อ — ห้ามใช้ข้อความตัวอย่าง เช่น &quot;ตัวเลือก A&quot;)
                      </label>
                      {q.choices.length < 6 && (
                        <button
                          type="button"
                          onClick={() =>
                            updateQuestion(qIdx, {
                              choices: [
                                ...q.choices,
                                {
                                  text: `คำตอบทางเลือกที่ ${q.choices.length + 1}`,
                                  isCorrect: false,
                                },
                              ],
                            })
                          }
                          className="text-xs text-blue-600 hover:underline"
                        >
                          + เพิ่มตัวเลือก
                        </button>
                      )}
                    </div>
                    <div className="grid md:grid-cols-2 gap-2">
                      {q.choices.map((c, cIdx) => (
                        <div key={cIdx} className="flex items-center gap-2">
                          <input
                            type="radio"
                            name={`q-${qIdx}-correct`}
                            checked={c.isCorrect}
                            onChange={() =>
                              updateQuestion(qIdx, {
                                choices: q.choices.map((item, i) => ({
                                  ...item,
                                  isCorrect: i === cIdx,
                                })),
                              })
                            }
                            title="เลือกเป็นคำตอบที่ถูกต้อง"
                          />
                          <input
                            type="text"
                            className="input text-xs flex-1"
                            value={c.text}
                            onChange={(e) =>
                              updateQuestion(qIdx, {
                                choices: q.choices.map((item, i) =>
                                  i === cIdx
                                    ? { ...item, text: e.target.value }
                                    : item,
                                ),
                              })
                            }
                            required
                          />
                          {q.choices.length > 2 && (
                            <button
                              type="button"
                              onClick={() =>
                                updateQuestion(qIdx, {
                                  choices: q.choices.filter((_, i) => i !== cIdx),
                                })
                              }
                              className="text-xs text-red-500"
                            >
                              ×
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                    <div>
                      <label className="label">คำอธิบายเฉลย (Explanation)</label>
                      <input
                        type="text"
                        className="input text-xs"
                        value={q.explanation}
                        onChange={(e) =>
                          updateQuestion(qIdx, { explanation: e.target.value })
                        }
                      />
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="grid md:grid-cols-2 gap-3">
                      <div>
                        <label className="label">Starter Code</label>
                        <textarea
                          rows={3}
                          className="input font-mono text-xs"
                          value={q.starterCode}
                          onChange={(e) =>
                            updateQuestion(qIdx, { starterCode: e.target.value })
                          }
                        />
                      </div>
                      <div>
                        <label className="label">
                          Solution Code อ้างอิง (ไม่บังคับ)
                        </label>
                        <textarea
                          rows={3}
                          className="input font-mono text-xs"
                          placeholder="ใส่โค้ดเฉลยอ้างอิงเฉพาะกรณีต้องการบันทึกไว้ตรวจสอบ..."
                          value={q.solutionCode}
                          onChange={(e) =>
                            updateQuestion(qIdx, { solutionCode: e.target.value })
                          }
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="label mb-0">
                          Test Cases (ต้องมีทั้ง Visible และ Hidden อย่างน้อยอย่างละ 1 เคส)
                        </label>
                        <button
                          type="button"
                          onClick={() =>
                            updateQuestion(qIdx, {
                              testCases: [
                                ...q.testCases,
                                {
                                  input: String(q.testCases.length + 1),
                                  expectedOutput: String(q.testCases.length + 1),
                                  isHidden: true,
                                },
                              ],
                            })
                          }
                          className="text-xs text-blue-600 hover:underline"
                        >
                          + เพิ่ม Test Case
                        </button>
                      </div>
                      {q.testCases.map((tc, tcIdx) => (
                        <div
                          key={tcIdx}
                          className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center"
                        >
                          <input
                            type="text"
                            className="input text-xs sm:col-span-5 font-mono"
                            placeholder="Input"
                            value={tc.input}
                            onChange={(e) =>
                              updateQuestion(qIdx, {
                                testCases: q.testCases.map((item, i) =>
                                  i === tcIdx
                                    ? { ...item, input: e.target.value }
                                    : item,
                                ),
                              })
                            }
                          />
                          <input
                            type="text"
                            className="input text-xs sm:col-span-5 font-mono"
                            placeholder="Expected Output"
                            value={tc.expectedOutput}
                            onChange={(e) =>
                              updateQuestion(qIdx, {
                                testCases: q.testCases.map((item, i) =>
                                  i === tcIdx
                                    ? { ...item, expectedOutput: e.target.value }
                                    : item,
                                ),
                              })
                            }
                          />
                          <label className="sm:col-span-2 flex items-center gap-1 text-xs">
                            <input
                              type="checkbox"
                              checked={tc.isHidden}
                              onChange={(e) =>
                                updateQuestion(qIdx, {
                                  testCases: q.testCases.map((item, i) =>
                                    i === tcIdx
                                      ? { ...item, isHidden: e.target.checked }
                                      : item,
                                  ),
                                })
                              }
                            />
                            Hidden
                          </label>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <button type="submit" className="btn-primary">
          {editingId
            ? 'บันทึกการแก้ไขชุดข้อสอบกลาง'
            : '+ สร้างและเผยแพร่ข้อสอบกลาง'}
        </button>
      </form>

      {/* Assessments Table */}
      <div className="card overflow-x-auto">
        {loading ? (
          <div className="p-8 text-center text-slate-500">กำลังโหลดชุดข้อสอบ...</div>
        ) : (
          <table className="w-full min-w-[820px] text-sm text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 text-slate-600">
                <th className="py-2.5 px-3">ชื่อข้อสอบ</th>
                <th className="py-2.5 px-3">ทักษะ</th>
                <th className="py-2.5 px-3">ประเภท / บทบาท</th>
                <th className="py-2.5 px-3">ความพร้อม & การสอบ</th>
                <th className="py-2.5 px-3">สถานะ</th>
                <th className="py-2.5 px-3">นโยบายเปิดเผยเฉลย</th>
                <th className="py-2.5 px-3">จัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {assessments.map((a) => {
                const attemptCount = a._count?.attempts ?? 0;
                return (
                  <tr key={a.id} className="hover:bg-slate-50">
                    <td className="py-2.5 px-3">
                      <div className="font-semibold text-slate-900">{a.title}</div>
                      <div className="text-[11px] text-slate-500">
                        v{a.version ?? 1} • {a.questions?.length ?? 0} ข้อ •{' '}
                        {a.timeLimitMinutes ?? 30} นาที (ผ่าน {a.passingScore ?? 70}%)
                      </div>
                    </td>
                    <td className="py-2.5 px-3">{a.skill?.name || '-'}</td>
                    <td className="py-2.5 px-3 text-xs">
                      {a.examType} ({a.assessmentRole})
                    </td>
                    <td className="py-2.5 px-3 text-xs space-y-1">
                      <div>
                        <span
                          className={`badge ${
                            a.isReady
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-red-100 text-red-700'
                          }`}
                        >
                          {a.isReady ? 'พร้อมสอบ (Ready)' : 'ไม่พร้อม'}
                        </span>
                      </div>
                      <div className="text-slate-500">
                        เข้าสอบแล้ว {attemptCount} ครั้ง
                      </div>
                    </td>
                    <td className="py-2.5 px-3">
                      <select
                        className="input text-xs w-36"
                        value={a.status}
                        onChange={(e) => handleUpdateStatus(a.id, e.target.value)}
                      >
                        <option value="PUBLISHED">PUBLISHED</option>
                        <option value="RETIRED">RETIRED</option>
                      </select>
                    </td>
                    <td className="py-2.5 px-3">
                      <select
                        className="input text-xs w-44"
                        value={a.feedbackVisibility}
                        onChange={(e) =>
                          handleUpdateVisibility(a.id, e.target.value)
                        }
                      >
                        <option value="IMMEDIATE">IMMEDIATE (FULL_REVIEW)</option>
                        <option value="AFTER_REVIEW">
                          AFTER_REVIEW (SUMMARY_ONLY)
                        </option>
                        <option value="PRIVATE_TO_COMPANY">
                          PRIVATE_TO_COMPANY (SCORE_ONLY)
                        </option>
                      </select>
                    </td>
                    <td className="py-2.5 px-3">
                      <div className="flex flex-wrap gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleViewAttempts(a)}
                          className="btn-secondary text-xs"
                        >
                          ผลสอบ ({attemptCount})
                        </button>
                        <button
                          type="button"
                          onClick={() => handleStartEdit(a)}
                          className="btn-secondary text-xs"
                        >
                          แก้ไข
                        </button>
                        <button
                          type="button"
                          disabled={attemptCount > 0}
                          onClick={() => handleDelete(a)}
                          className="btn-danger text-xs disabled:opacity-40"
                          title={
                            attemptCount > 0
                              ? 'ไม่สามารถลบข้อสอบที่มีผู้เข้าสอบแล้วได้ (ให้เปลี่ยนสถานะเป็น RETIRED แทน)'
                              : 'ลบชุดข้อสอบ'
                          }
                        >
                          ลบ
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Attempts Viewer Panel */}
      {selectedExamForAttempts && (
        <div className="card space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-bold text-slate-900">
                ประวัติการเข้าสอบ: {selectedExamForAttempts.title}
              </h2>
              <p className="text-xs text-slate-500">
                รายการผู้สมัครที่เข้าทำแบบทดสอบมาตรฐานกลางชุดนี้
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSelectedExamForAttempts(null)}
              className="btn-secondary text-xs"
            >
              ปิดตารางผลสอบ
            </button>
          </div>

          {loadingAttempts ? (
            <div className="p-6 text-center text-slate-500 text-xs">
              กำลังโหลดผลการสอบ...
            </div>
          ) : attempts.length === 0 ? (
            <div className="p-6 text-center text-slate-500 text-xs">
              ยังไม่มีผู้สมัครเข้าสอบในชุดข้อสอบนี้
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[600px] text-xs text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-600">
                    <th className="py-2 px-3">ผู้สมัคร</th>
                    <th className="py-2 px-3">อีเมล</th>
                    <th className="py-2 px-3">คะแนน (%)</th>
                    <th className="py-2 px-3">สถานะ</th>
                    <th className="py-2 px-3">เวลาเริ่มสอบ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {attempts.map((att) => (
                    <tr key={att.id} className="hover:bg-slate-50">
                      <td className="py-2 px-3 font-semibold">
                        {att.candidate?.fullName || '-'}
                      </td>
                      <td className="py-2 px-3">
                        {att.candidate?.user?.email || '-'}
                      </td>
                      <td className="py-2 px-3 font-mono font-bold">
                        {typeof att.effectivePercentage === 'number'
                          ? `${att.effectivePercentage.toFixed(1)}%`
                          : '-'}
                      </td>
                      <td className="py-2 px-3">
                        <span className="badge bg-slate-100 text-slate-700">
                          {att.status}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-slate-500">
                        {att.startedAt
                          ? new Date(att.startedAt).toLocaleString('th-TH')
                          : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
