'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { apiFetch } from '@/lib/api';
import {
  CompanyLogo,
  resolveJobLogoUrl,
} from '@/components/CompanyLogo';
import { CourseDetailModal } from '@/components/CourseDetailModal';

export default function LearningPlanPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [selectedCourse, setSelectedCourse] = useState<any | null>(null);

  // Local edits keyed by `${evaluationId}:${skillId}`
  const [edits, setEdits] = useState<
    Record<
      string,
      {
        status: string;
        note: string;
        evidenceUrl: string;
        revision: string | null;
        expectedUpdatedAt: string | null;
      }
    >
  >({});

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await apiFetch<any>('/recommendations/development-plan');
      setData(res);
      const nextEdits: Record<string, any> = {};
      (res?.evaluations || []).forEach((ev: any) => {
        const evalId = ev.evaluationId || ev.id;
        (ev.skills || []).forEach((sk: any) => {
          const key = `${evalId}:${sk.skillId}`;
          nextEdits[key] = {
            status: sk.progress?.status || 'NOT_STARTED',
            note: sk.progress?.note || '',
            evidenceUrl: sk.progress?.evidenceUrl || '',
            revision: ev.revision || null,
            expectedUpdatedAt: sk.progress?.updatedAt ?? null,
          };
        });
      });
      setEdits(nextEdits);
    } catch (err: any) {
      setError(err.message || 'ไม่สามารถโหลดข้อมูลแผนพัฒนาทักษะได้');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSaveProgress = async (evaluationId: string, skillId: string) => {
    const key = `${evaluationId}:${skillId}`;
    const item = edits[key] || {
      status: 'IN_PROGRESS',
      note: '',
      evidenceUrl: '',
      revision: undefined,
      expectedUpdatedAt: null,
    };
    setSavingKey(key);
    setMessage('');
    setError('');
    try {
      await apiFetch(
        `/recommendations/development-plan/${evaluationId}/skills/${skillId}/progress`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            status: item.status,
            note: item.note,
            evidenceUrl: item.evidenceUrl || null,
            revision: item.revision || undefined,
            expectedUpdatedAt: item.expectedUpdatedAt,
          }),
        },
      );
      setMessage('บันทึกความคืบหน้าการพัฒนาทักษะเรียบร้อยแล้ว');
      await loadData();
    } catch (err: any) {
      if (err.status === 409) {
        setError('ข้อมูลถูกอัปเดตจากหน้าต่างอื่น ระบบกำลังโหลดข้อมูลเวอร์ชันล่าสุดให้ใหม่...');
        await loadData();
      } else {
        setError(err.message || 'ไม่สามารถบันทึกความคืบหน้าได้');
      }
    } finally {
      setSavingKey(null);
    }
  };

  if (loading) {
    return <div className="p-10 text-center text-slate-500">กำลังโหลดแผนพัฒนาทักษะ...</div>;
  }

  const evaluations = data?.evaluations || [];
  const trackedSkillItems: Array<{
    evaluationId: string;
    companyName: string;
    jobTitle: string;
    developmentNote: string | null;
    skillItem: any;
  }> = [];

  evaluations.forEach((ev: any) => {
    const evalId = ev.evaluationId || ev.id;
    const companyName = ev.company?.name || ev.company?.companyName || 'บริษัท';
    const jobTitle = ev.job?.title || ev.application?.job?.title || 'ตำแหน่งงาน';
    (ev.skills || []).forEach((sk: any) => {
      trackedSkillItems.push({
        evaluationId: evalId,
        companyName,
        jobTitle,
        developmentNote: ev.developmentNote || null,
        skillItem: sk,
      });
    });
  });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">
          ผลประเมินจากบริษัทและแผนพัฒนาทักษะ (Learning Plan)
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

      {/* Company Evaluations */}
      <div className="space-y-4">
        <h2 className="text-lg font-bold text-slate-900">
          ผลประเมินและข้อเสนอแนะจากบริษัท ({evaluations.length})
        </h2>
        {evaluations.length === 0 ? (
          <div className="card text-center py-8 text-slate-500 text-sm">
            ยังไม่มีผลประเมินจากบริษัทในขณะนี้
          </div>
        ) : (
          <div className="grid md:grid-cols-2 gap-6">
            {evaluations.map((ev: any) => {
              const evalId = ev.evaluationId || ev.id;
              const scores = ev.scores || ev;
              const tech = Number(scores.technicalScore ?? 0);
              const prob = Number(scores.problemSolvingScore ?? 0);
              const comm = Number(scores.communicationScore ?? 0);
              const team = Number(scores.teamworkScore ?? scores.cultureFitScore ?? 0);
              const avgScore = ((tech + prob + comm + team) / 4).toFixed(1);
              const jobObj = ev.job || ev.application?.job;
              const strengthsList = Array.isArray(ev.strengths)
                ? ev.strengths
                : ev.strengths
                  ? [ev.strengths]
                  : [];

              return (
                <div key={evalId} className="card space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
                    <div className="flex items-center gap-3">
                      <CompanyLogo
                        logoUrl={ev.company?.logoUrl || resolveJobLogoUrl(jobObj)}
                        companyName={ev.company?.name || ev.company?.companyName || 'บริษัท'}
                        size="sm"
                      />
                      <div>
                        <h3 className="font-bold text-slate-900">
                          {jobObj?.title || 'ตำแหน่งงาน'}
                        </h3>
                        <p className="text-xs text-slate-500">
                          {ev.company?.name || ev.company?.companyName}
                        </p>
                      </div>
                    </div>
                    <span className="badge bg-blue-100 text-blue-800 text-sm">
                      คะแนนเฉลี่ย {avgScore} / 5.0
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                    <div className="p-2 rounded bg-slate-50">
                      ทักษะเทคนิค (Technical): <b>{tech} / 5</b>
                    </div>
                    <div className="p-2 rounded bg-slate-50">
                      การแก้ปัญหา (Problem Solving): <b>{prob} / 5</b>
                    </div>
                    <div className="p-2 rounded bg-slate-50">
                      การสื่อสาร (Communication): <b>{comm} / 5</b>
                    </div>
                    <div className="p-2 rounded bg-slate-50">
                      การทำงานร่วมกัน (Teamwork): <b>{team} / 5</b>
                    </div>
                  </div>

                  {ev.overallFeedback && (
                    <div className="text-xs text-slate-700">
                      <span className="font-semibold text-slate-900">ความเห็นโดยรวม:</span>{' '}
                      {ev.overallFeedback}
                    </div>
                  )}

                  {strengthsList.length > 0 && (
                    <div className="text-xs text-slate-700">
                      <span className="font-semibold text-emerald-700">จุดแข็ง:</span>{' '}
                      {strengthsList.join(', ')}
                    </div>
                  )}

                  {ev.developmentNote && (
                    <div className="text-xs text-slate-700">
                      <span className="font-semibold text-amber-700">สิ่งที่ควรพัฒนาเพิ่ม:</span>{' '}
                      {ev.developmentNote}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Skill Progress Tracker */}
      <div className="card space-y-4">
        <h2 className="text-lg font-bold text-slate-900">
          บันทึกความคืบหน้าการพัฒนาทักษะ (Skill Progress Tracker)
        </h2>
        {trackedSkillItems.length === 0 ? (
          <p className="text-sm text-slate-500">
            เมื่อบริษัทส่งคำแนะนำทักษะที่ควรพัฒนา รายการทักษะจะปรากฏที่นี่เพื่อให้คุณติดตามความคืบหน้า
          </p>
        ) : (
          <div className="space-y-4">
            {trackedSkillItems.map(
              ({ evaluationId, companyName, jobTitle, developmentNote, skillItem }) => {
                const key = `${evaluationId}:${skillItem.skillId}`;
                const edit = edits[key] || {
                  status: 'NOT_STARTED',
                  note: '',
                  evidenceUrl: '',
                  revision: null,
                  expectedUpdatedAt: null,
                };
                return (
                  <div
                    key={key}
                    className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-3"
                  >
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div>
                        <span className="font-bold text-slate-900">{skillItem.skillName}</span>
                        <span className="ml-2 text-xs text-slate-500">
                          (แนะนำโดย {companyName} — {jobTitle})
                        </span>
                        {developmentNote && (
                          <p className="text-xs text-slate-600 mt-0.5">
                            คำแนะนำ: {developmentNote}
                          </p>
                        )}
                      </div>
                      {edit.revision && (
                        <span className="badge bg-slate-200 text-slate-700 text-[11px]">
                          อัปเดตล่าสุด: {new Date(edit.revision).toLocaleString('th-TH')}
                        </span>
                      )}
                    </div>

                    {skillItem.recommendedCourses?.length > 0 && (
                      <div className="text-xs space-y-1">
                        <div className="font-semibold text-slate-700">คอร์สเรียนที่แนะนำ:</div>
                        <div className="flex flex-wrap gap-2">
                          {skillItem.recommendedCourses.map((c: any) => (
                            <div
                              key={c.id}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white border border-slate-200"
                            >
                              <button
                                type="button"
                                onClick={() => setSelectedCourse(c)}
                                className="text-slate-800 font-medium hover:text-blue-600 hover:underline text-left"
                              >
                                {c.title} ({c.provider})
                              </button>
                              <button
                                type="button"
                                onClick={() => setSelectedCourse(c)}
                                className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 hover:bg-blue-100 text-[11px] font-semibold"
                              >
                                รายละเอียด
                              </button>
                              <a
                                href={c.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-600 font-semibold hover:underline"
                                title="เปิดลิงก์คอร์สเรียน"
                              >
                                ↗
                              </a>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="grid md:grid-cols-3 gap-3">
                      <div>
                        <label className="label">สถานะการเรียนรู้</label>
                        <select
                          className="input"
                          value={edit.status}
                          onChange={(e) =>
                            setEdits((prev) => ({
                              ...prev,
                              [key]: { ...edit, status: e.target.value },
                            }))
                          }
                        >
                          <option value="NOT_STARTED">ยังไม่เริ่ม (NOT_STARTED)</option>
                          <option value="IN_PROGRESS">กำลังศึกษา (IN_PROGRESS)</option>
                          <option value="COMPLETED">พัฒนาสำเร็จแล้ว (COMPLETED)</option>
                        </select>
                      </div>
                      <div>
                        <label className="label">ลิงก์หลักฐาน (HTTPS Evidence URL)</label>
                        <input
                          type="url"
                          className="input"
                          placeholder="https://github.com/... หรือ https://..."
                          value={edit.evidenceUrl}
                          onChange={(e) =>
                            setEdits((prev) => ({
                              ...prev,
                              [key]: { ...edit, evidenceUrl: e.target.value },
                            }))
                          }
                        />
                      </div>
                      <div>
                        <label className="label">บันทึกสิ่งที่ได้เรียนรู้ (Note)</label>
                        <input
                          type="text"
                          className="input"
                          placeholder="สรุปโปรเจกต์หรือคอร์สที่เรียนจบ..."
                          value={edit.note}
                          onChange={(e) =>
                            setEdits((prev) => ({
                              ...prev,
                              [key]: { ...edit, note: e.target.value },
                            }))
                          }
                        />
                      </div>
                    </div>

                    <div className="flex justify-end">
                      <button
                        onClick={() => handleSaveProgress(evaluationId, skillItem.skillId)}
                        disabled={savingKey === key}
                        className="btn-primary text-xs"
                      >
                        {savingKey === key ? 'กำลังบันทึก...' : 'อัปเดตความคืบหน้า'}
                      </button>
                    </div>
                  </div>
                );
              },
            )}
          </div>
        )}
      </div>

      <CourseDetailModal
        course={selectedCourse}
        onClose={() => setSelectedCourse(null)}
      />
    </div>
  );
}
