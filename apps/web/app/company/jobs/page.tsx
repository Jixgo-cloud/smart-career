'use client';

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';

export default function CompanyJobsPage() {
  const [jobs, setJobs] = useState<any[]>([]);
  const [masterSkills, setMasterSkills] = useState<any[]>([]);
  const [companyAssessments, setCompanyAssessments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  // Edit Job Modal State
  const [editingJob, setEditingJob] = useState<any>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editEmploymentType, setEditEmploymentType] = useState('FULL_TIME');
  const [editLocation, setEditLocation] = useState('');
  const [editIsRemote, setEditIsRemote] = useState(false);
  const [editSalaryMin, setEditSalaryMin] = useState<number | ''>('');
  const [editSalaryMax, setEditSalaryMax] = useState<number | ''>('');
  const [editSalaryCurrency, setEditSalaryCurrency] = useState('THB');
  const [editAcceptedQuota, setEditAcceptedQuota] = useState<number | ''>('');
  const [editCustomAssessmentId, setEditCustomAssessmentId] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editRequirements, setEditRequirements] = useState('');
  const [editBenefits, setEditBenefits] = useState('');
  const [editSkills, setEditSkills] = useState<
    Array<{ skillId: string; isRequired: boolean; minimumScore: number }>
  >([]);
  const [savingEdit, setSavingEdit] = useState(false);

  const loadJobs = useCallback(async () => {
    setLoading(true);
    try {
      const [res, sk, ass] = await Promise.all([
        apiFetch<any>('/company/profile'),
        apiFetch<any[]>('/skills').catch(() => []),
        apiFetch<any[]>('/company/assessments').catch(() => []),
      ]);
      setJobs(Array.isArray(res) ? res : res?.jobs || []);
      setMasterSkills(sk || []);
      setCompanyAssessments(ass || []);
    } catch (err: any) {
      setError(err.message || 'ไม่สามารถดึงรายการตำแหน่งงานได้');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadJobs();
  }, [loadJobs]);

  const handleOpenEdit = (job: any) => {
    setEditingJob(job);
    setEditTitle(job.title || '');
    setEditEmploymentType(job.employmentType || job.jobType || 'FULL_TIME');
    setEditLocation(job.location || '');
    setEditIsRemote(Boolean(job.isRemote));
    setEditSalaryMin(job.salaryMin ?? '');
    setEditSalaryMax(job.salaryMax ?? '');
    setEditSalaryCurrency(job.salaryCurrency || 'THB');
    setEditAcceptedQuota(job.acceptedQuota ?? '');
    setEditCustomAssessmentId(job.customAssessmentId || '');
    setEditDescription(job.description || '');
    setEditRequirements(job.requirements || '');
    setEditBenefits(job.benefits || '');
    setEditSkills(
      Array.isArray(job.skills)
        ? job.skills.map((js: any) => ({
            skillId: js.skillId || js.skill?.id,
            isRequired: js.isRequired !== undefined ? Boolean(js.isRequired) : true,
            minimumScore: Number(js.minimumScore ?? 60),
          }))
        : [],
    );
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingJob) return;
    setSavingEdit(true);
    setMessage('');
    setError('');
    try {
      await apiFetch(`/company/jobs/${editingJob.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          title: editTitle,
          employmentType: editEmploymentType,
          location: editLocation,
          isRemote: editIsRemote,
          salaryMin: editSalaryMin === '' ? null : Number(editSalaryMin),
          salaryMax: editSalaryMax === '' ? null : Number(editSalaryMax),
          salaryCurrency: editSalaryCurrency,
          acceptedQuota: editAcceptedQuota === '' ? null : Number(editAcceptedQuota),
          customAssessmentId: editCustomAssessmentId || null,
          description: editDescription,
          requirements: editRequirements.trim() || null,
          benefits: editBenefits.trim() || null,
          skills: editSkills,
        }),
      });
      setMessage(`บันทึกการแก้ไขตำแหน่งงาน "${editTitle}" เรียบร้อยแล้ว`);
      setEditingJob(null);
      await loadJobs();
    } catch (err: any) {
      setError(err.message || 'ไม่สามารถแก้ไขประกาศงานได้');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleToggleActive = async (job: any) => {
    setMessage('');
    setError('');
    try {
      await apiFetch(`/company/jobs/${job.id}/toggle`, {
        method: 'PATCH',
      });
      await loadJobs();
    } catch (err: any) {
      setError(err.message || 'อัปเดตสถานะงานไม่สำเร็จ');
    }
  };

  const handleDeleteJob = async (jobId: string) => {
    setMessage('');
    setError('');
    try {
      await apiFetch(`/company/jobs/${jobId}`, { method: 'DELETE' });
      setMessage('ลบประกาศตำแหน่งงานเรียบร้อยแล้ว');
      await loadJobs();
    } catch (err: any) {
      setError(err.message || 'ไม่สามารถลบตำแหน่งงานที่มีผู้สมัครแล้วได้');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">จัดการตำแหน่งงานของบริษัท</h1>
        </div>
        <Link href="/company/jobs/new" className="btn-primary self-start sm:self-auto shrink-0">
          + สร้างประกาศงานใหม่
        </Link>
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

      {/* Edit Job Form Drawer / Card */}
      {editingJob && (
        <form
          onSubmit={handleSaveEdit}
          className="card space-y-4 border-2 border-blue-500 bg-blue-50/15"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-bold text-slate-900">
              แก้ไขประกาศตำแหน่งงาน: {editingJob.title}
            </h2>
            <button
              type="button"
              onClick={() => setEditingJob(null)}
              className="btn-secondary text-xs"
            >
              ยกเลิกการแก้ไข
            </button>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="label">ชื่อตำแหน่งงาน</label>
              <input
                type="text"
                className="input"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="label">รูปแบบการจ้างงาน</label>
              <select
                className="input"
                value={editEmploymentType}
                onChange={(e) => setEditEmploymentType(e.target.value)}
              >
                <option value="FULL_TIME">Full-Time</option>
                <option value="PART_TIME">Part-Time</option>
                <option value="CONTRACT">Contract</option>
                <option value="INTERNSHIP">Internship</option>
                <option value="REMOTE">Remote</option>
              </select>
            </div>
            <div>
              <label className="label">สถานที่ปฏิบัติงาน</label>
              <div className="flex items-center gap-3">
                <input
                  type="text"
                  className="input flex-1"
                  value={editLocation}
                  onChange={(e) => setEditLocation(e.target.value)}
                />
                <label className="flex items-center gap-1.5 text-xs text-slate-700 shrink-0 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editIsRemote}
                    onChange={(e) => setEditIsRemote(e.target.checked)}
                  />
                  Remote
                </label>
              </div>
            </div>
            <div>
              <label className="label">เงินเดือนขั้นต่ำ ({editSalaryCurrency})</label>
              <input
                type="number"
                className="input"
                value={editSalaryMin}
                onChange={(e) =>
                  setEditSalaryMin(e.target.value === '' ? '' : Number(e.target.value))
                }
              />
            </div>
            <div>
              <label className="label">เงินเดือนสูงสุด ({editSalaryCurrency})</label>
              <input
                type="number"
                className="input"
                value={editSalaryMax}
                onChange={(e) =>
                  setEditSalaryMax(e.target.value === '' ? '' : Number(e.target.value))
                }
              />
            </div>
            <div>
              <label className="label">โควต้ารับเข้าทำงาน (เว้นว่าง = ไม่จำกัด)</label>
              <input
                type="number"
                min={1}
                className="input"
                value={editAcceptedQuota}
                onChange={(e) =>
                  setEditAcceptedQuota(e.target.value === '' ? '' : Number(e.target.value))
                }
              />
            </div>
            <div>
              <label className="label">ข้อสอบคัดเลือกของบริษัทที่ผูกกับตำแหน่งงาน</label>
              <select
                className="input"
                value={editCustomAssessmentId}
                onChange={(e) => setEditCustomAssessmentId(e.target.value)}
              >
                <option value="">-- ไม่ผูกข้อสอบอัตโนมัติ --</option>
                {companyAssessments.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.title}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="label">รายละเอียดงานและหน้าที่ความรับผิดชอบ</label>
            <textarea
              rows={4}
              className="input"
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
              required
            />
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="label">คุณสมบัติผู้สมัคร (Requirements)</label>
              <textarea
                rows={3}
                className="input"
                value={editRequirements}
                onChange={(e) => setEditRequirements(e.target.value)}
              />
            </div>
            <div>
              <label className="label">สวัสดิการ (Benefits)</label>
              <textarea
                rows={3}
                className="input"
                value={editBenefits}
                onChange={(e) => setEditBenefits(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2 pt-2 border-t border-slate-200">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="label mb-0">
                ทักษะที่ต้องการสำหรับตำแหน่งงานนี้ (จับคู่กับทักษะใน GitHub และผลสอบของผู้สมัคร)
              </label>
              <button
                type="button"
                onClick={() => {
                  if (masterSkills.length === 0) return;
                  setEditSkills((prev) => [
                    ...prev,
                    { skillId: masterSkills[0].id, isRequired: true, minimumScore: 50 },
                  ]);
                }}
                className="btn-secondary text-xs shrink-0"
              >
                + เพิ่มทักษะ
              </button>
            </div>

            {editSkills.map((row, idx) => (
              <div key={idx} className="grid grid-cols-1 sm:grid-cols-3 gap-2 items-center">
                <select
                  className="input text-xs"
                  value={row.skillId}
                  onChange={(e) =>
                    setEditSkills((prev) =>
                      prev.map((r, i) => (i === idx ? { ...r, skillId: e.target.value } : r)),
                    )
                  }
                >
                  {masterSkills.map((sk) => (
                    <option key={sk.id} value={sk.id}>
                      {sk.name}
                    </option>
                  ))}
                </select>
                <select
                  className="input text-xs"
                  value={row.isRequired ? 'true' : 'false'}
                  onChange={(e) =>
                    setEditSkills((prev) =>
                      prev.map((r, i) =>
                        i === idx ? { ...r, isRequired: e.target.value === 'true' } : r,
                      ),
                    )
                  }
                >
                  <option value="true">Required (ทักษะบังคับ)</option>
                  <option value="false">Preferred (ทักษะเสริม)</option>
                </select>
                <button
                  type="button"
                  onClick={() => setEditSkills((prev) => prev.filter((_, i) => i !== idx))}
                  className="btn-danger text-xs"
                >
                  ลบ
                </button>
              </div>
            ))}
          </div>

          <button type="submit" disabled={savingEdit} className="btn-primary">
            {savingEdit ? 'กำลังบันทึกการแก้ไข...' : 'บันทึกการแก้ไขประกาศงาน'}
          </button>
        </form>
      )}

      {loading ? (
        <div className="p-10 text-center text-slate-500">กำลังโหลด...</div>
      ) : jobs.length === 0 ? (
        <div className="card text-center py-12 text-slate-500">
          ยังไม่มีประกาศตำแหน่งงานของบริษัท
        </div>
      ) : (
        <div className="space-y-4">
          {jobs.map((job) => (
            <div
              key={job.id}
              className="card flex flex-col md:flex-row md:items-center justify-between gap-4"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className={`badge ${
                      job.isActive
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-slate-200 text-slate-700'
                    }`}
                  >
                    {job.isActive ? 'เปิดรับสมัคร (Active)' : 'ปิดรับสมัครแล้ว'}
                  </span>
                  <span className="badge bg-blue-50 text-blue-700">
                    {job.employmentType || job.jobType}
                  </span>
                  {job.isRemote && (
                    <span className="badge bg-indigo-50 text-indigo-700">Remote</span>
                  )}
                </div>
                <h2 className="text-lg font-bold text-slate-900">{job.title}</h2>
                <p className="text-xs text-slate-500">
                  ผู้สมัครทั้งหมด: <b>{job._count?.applications || 0}</b> คน • โควต้ารับเข้าทำงาน:{' '}
                  <b>
                    {job.acceptedCount}/{job.acceptedQuota || 'ไม่จำกัด'}
                  </b>
                  {job.salaryMin || job.salaryMax ? (
                    <>
                      {' '}
                      • เงินเดือน: {job.salaryMin?.toLocaleString() || 0} -{' '}
                      {job.salaryMax?.toLocaleString() || 'ไม่จำกัด'} {job.salaryCurrency || 'THB'}
                    </>
                  ) : null}
                </p>
                <div className="flex flex-wrap gap-1 pt-1">
                  {(job.skills || []).map((js: any) => (
                    <span key={js.id} className="badge bg-slate-100 text-slate-700">
                      {js.skill?.name} ({js.isRequired ? 'บังคับ' : 'เสริม'})
                    </span>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-2.5 shrink-0 flex-wrap">
                <div className="btn-segmented-group">
                  <button
                    type="button"
                    onClick={() => handleOpenEdit(job)}
                    className="btn-segmented-item hover:text-blue-600"
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
                    แก้ไขประกาศ
                  </button>
                  <button
                    type="button"
                    onClick={() => handleToggleActive(job)}
                    className="btn-segmented-item bg-slate-50/60 hover:bg-slate-100"
                  >
                    <span
                      className={`w-2 h-2 rounded-full shrink-0 ${
                        job.isActive ? 'bg-amber-500' : 'bg-emerald-500'
                      }`}
                      aria-hidden="true"
                    />
                    {job.isActive ? 'ปิดรับสมัคร' : 'เปิดรับสมัคร'}
                  </button>
                </div>

                {(job._count?.applications || 0) === 0 && (
                  <button
                    type="button"
                    onClick={() => handleDeleteJob(job.id)}
                    className="btn-danger text-xs px-3 py-2"
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
                    ลบประกาศ
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
