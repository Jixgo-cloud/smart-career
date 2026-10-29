'use client';

import React, { useEffect, useState, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { apiFetch } from '@/lib/api';

function CompanyApplicationsInner() {
  const searchParams = useSearchParams();
  const initialJobId = searchParams.get('jobId') || '';

  const [applications, setApplications] = useState<any[]>([]);
  const [companyJobs, setCompanyJobs] = useState<any[]>([]);
  const [companyAssessments, setCompanyAssessments] = useState<any[]>([]);
  const [masterSkills, setMasterSkills] = useState<any[]>([]);

  // Filter & Sort states
  const [selectedJobId, setSelectedJobId] = useState(initialJobId);
  const [selectedStatus, setSelectedStatus] = useState('');
  const [minCodingScore, setMinCodingScore] = useState('');
  const [sortOrder, setSortOrder] = useState('');

  // Status note & internal note per application
  const [statusNotes, setStatusNotes] = useState<Record<string, string>>({});
  const [internalNotes, setInternalNotes] = useState<Record<string, string>>({});

  // Candidate Screening Profile Modal
  const [screeningData, setScreeningData] = useState<any>(null);
  const [loadingScreening, setLoadingScreening] = useState(false);

  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  // Evaluation Modal / Drawer state (1-5 scale per backend contract)
  const [evaluatingApp, setEvaluatingApp] = useState<any>(null);
  const [technicalScore, setTechnicalScore] = useState(4);
  const [problemSolvingScore, setProblemSolvingScore] = useState(4);
  const [communicationScore, setCommunicationScore] = useState(4);
  const [teamworkScore, setTeamworkScore] = useState(4);
  const [overallFeedback, setOverallFeedback] = useState('');
  const [strengths, setStrengths] = useState('');
  const [devSkillIds, setDevSkillIds] = useState<string[]>([]);
  const [developmentNote, setDevelopmentNote] = useState('');

  useEffect(() => {
    const qJobId = searchParams.get('jobId');
    if (qJobId !== null && qJobId !== selectedJobId) {
      setSelectedJobId(qJobId);
    }
  }, [searchParams, selectedJobId]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedJobId) params.set('jobId', selectedJobId);
      if (selectedStatus) params.set('status', selectedStatus);
      if (minCodingScore) params.set('minCodingScore', minCodingScore);
      if (sortOrder) {
        params.set('sortBy', 'codingScore');
        params.set('sortOrder', sortOrder);
      }

      const [apps, ass, sk, jobs] = await Promise.all([
        apiFetch<any[]>(`/company/applications?${params.toString()}`),
        apiFetch<any[]>('/company/assessments').catch(() => []),
        apiFetch<any[]>('/skills').catch(() => []),
        apiFetch<any[]>('/company/jobs').catch(() => []),
      ]);
      setApplications(apps || []);
      setCompanyAssessments(ass || []);
      setMasterSkills(sk || []);
      setCompanyJobs(jobs || []);
      if (sk?.length > 0 && devSkillIds.length === 0) {
        setDevSkillIds([sk[0].id]);
      }
    } catch (err: any) {
      setError(err.message || 'ไม่สามารถดึงข้อมูลใบสมัครได้');
    } finally {
      setLoading(false);
    }
  }, [selectedJobId, selectedStatus, minCodingScore, sortOrder, devSkillIds.length]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleUpdateStatus = async (applicationId: string, status: string) => {
    setMessage('');
    setError('');
    try {
      const bodyPayload: Record<string, any> = { status };
      if (statusNotes[applicationId] !== undefined && statusNotes[applicationId].trim()) {
        bodyPayload.note = statusNotes[applicationId].trim();
      }
      if (internalNotes[applicationId] !== undefined) {
        bodyPayload.internalNote = internalNotes[applicationId];
      }
      await apiFetch(`/company/applications/${applicationId}/status`, {
        method: 'PUT',
        body: JSON.stringify(bodyPayload),
      });
      setMessage(`อัปเดตสถานะใบสมัครเป็น ${status} เรียบร้อยแล้ว`);
      await loadData();
    } catch (err: any) {
      setError(err.message || 'อัปเดตสถานะไม่สำเร็จ');
    }
  };

  const handleSaveInternalNote = async (app: any) => {
    setMessage('');
    setError('');
    try {
      await apiFetch(`/company/applications/${app.id}/status`, {
        method: 'PUT',
        body: JSON.stringify({
          status: app.status,
          note: statusNotes[app.id]?.trim() || 'Updated HR internal note',
          internalNote: internalNotes[app.id] ?? app.internalNote ?? '',
        }),
      });
      setMessage('บันทึกหมายเหตุและบันทึกภายใน (HR Internal Note) เรียบร้อยแล้ว');
      await loadData();
    } catch (err: any) {
      setError(err.message || 'บันทึกข้อมูลไม่สำเร็จ');
    }
  };

  const handleAssignAssessment = async (applicationId: string, assessmentId: string) => {
    if (!assessmentId) return;
    setMessage('');
    setError('');
    try {
      await apiFetch(`/company/applications/${applicationId}/assign-assessment`, {
        method: 'POST',
        body: JSON.stringify({
          assessmentId,
          note: statusNotes[applicationId]?.trim() || undefined,
        }),
      });
      setMessage('มอบหมายข้อสอบให้ผู้สมัครเรียบร้อยแล้ว');
      await loadData();
    } catch (err: any) {
      setError(err.message || 'มอบหมายข้อสอบไม่สำเร็จ');
    }
  };

  const handleViewCandidateProfile = async (candidateId: string, applicationId: string) => {
    setLoadingScreening(true);
    setError('');
    try {
      const res = await apiFetch<any>(
        `/company/candidates/${candidateId}?applicationId=${encodeURIComponent(applicationId)}`,
      );
      setScreeningData(res);
    } catch (err: any) {
      setError(err.message || 'ไม่สามารถดึงโปรไฟล์เชิงลึกของผู้สมัครได้');
    } finally {
      setLoadingScreening(false);
    }
  };

  const toggleDevSkill = (skillId: string) => {
    setDevSkillIds((prev) => {
      if (prev.includes(skillId)) {
        return prev.filter((id) => id !== skillId);
      }
      if (prev.length >= 10) return prev;
      return [...prev, skillId];
    });
  };

  const handleSubmitEvaluation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!evaluatingApp) return;
    setMessage('');
    setError('');
    try {
      const parsedStrengths = strengths
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean);

      await apiFetch(`/evaluations/${evaluatingApp.id}`, {
        method: 'POST',
        body: JSON.stringify({
          technicalScore: Math.min(5, Math.max(1, Math.round(Number(technicalScore) || 4))),
          problemSolvingScore: Math.min(
            5,
            Math.max(1, Math.round(Number(problemSolvingScore) || 4)),
          ),
          communicationScore: Math.min(
            5,
            Math.max(1, Math.round(Number(communicationScore) || 4)),
          ),
          teamworkScore: Math.min(5, Math.max(1, Math.round(Number(teamworkScore) || 4))),
          overallFeedback:
            overallFeedback.trim() || 'ผ่านการพิจารณาประเมินทักษะและสมรรถนะจากทางบริษัท',
          strengths: parsedStrengths,
          developmentSkillIds: devSkillIds,
          developmentNote:
            developmentNote.trim() || 'ฝึกฝนและทำข้อสอบปฏิบัติเพิ่มเติมในทักษะที่แนะนำ',
        }),
      });
      setMessage('บันทึกผลประเมิน 4 มิติและส่งข้อเสนอแนะไปยัง Learning Plan ของผู้สมัครแล้ว');
      setEvaluatingApp(null);
      await loadData();
    } catch (err: any) {
      setError(err.message || 'ส่งผลประเมินไม่สำเร็จ');
    }
  };

  const exportCsvHref = selectedJobId
    ? `/api/company/applications/export?jobId=${encodeURIComponent(selectedJobId)}`
    : '/api/company/applications/export';

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">คัดกรองผู้สมัครและประเมินผล</h1>
          <p className="text-sm text-slate-600">
            ตรวจสอบคะแนนสอบปฏิบัติ คะแนน Match ตอนสมัคร โปรไฟล์เชิงลึก มอบหมายข้อสอบ และส่งผลประเมิน 4 มิติ
          </p>
        </div>

        <a
          href={exportCsvHref}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-secondary text-xs shrink-0 self-start md:self-auto"
        >
          ⬇ Export CSV {selectedJobId ? '(เฉพาะตำแหน่งที่เลือก)' : '(ทั้งหมด)'}
        </a>
      </div>

      {/* Filter & Sort Toolbar */}
      <div className="card grid sm:grid-cols-2 md:grid-cols-4 gap-3">
        <div>
          <label className="label text-xs">กรองตามตำแหน่งงาน</label>
          <select
            className="input text-xs"
            value={selectedJobId}
            onChange={(e) => setSelectedJobId(e.target.value)}
          >
            <option value="">ทุกตำแหน่งงานทั้งหมด</option>
            {companyJobs.map((j) => (
              <option key={j.id} value={j.id}>
                {j.title}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="label text-xs">กรองตามสถานะใบสมัคร</label>
          <select
            className="input text-xs"
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
          >
            <option value="">ทุกสถานะ</option>
            <option value="APPLIED">APPLIED</option>
            <option value="REVIEWING">REVIEWING</option>
            <option value="TECHNICAL_TEST">TECHNICAL_TEST</option>
            <option value="INTERVIEW">INTERVIEW</option>
            <option value="OFFER">OFFER</option>
            <option value="ACCEPTED">ACCEPTED</option>
            <option value="REJECTED">REJECTED</option>
            <option value="CANCELLED">CANCELLED</option>
          </select>
        </div>

        <div>
          <label className="label text-xs">กรองคะแนน Coding ขั้นต่ำ (0–100 หรือ NONE)</label>
          <input
            type="text"
            placeholder="เช่น 70 หรือ NONE"
            className="input text-xs"
            value={minCodingScore}
            onChange={(e) => setMinCodingScore(e.target.value)}
          />
        </div>

        <div>
          <label className="label text-xs">เรียงลำดับผู้สมัคร</label>
          <select
            className="input text-xs"
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value)}
          >
            <option value="">วันที่สมัครล่าสุด</option>
            <option value="DESC">คะแนน Coding: มาก → น้อย</option>
            <option value="ASC">คะแนน Coding: น้อย → มาก</option>
          </select>
        </div>
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

      {/* Candidate Screening Profile Modal */}
      {screeningData && (
        <div className="card space-y-4 border-2 border-indigo-500 bg-indigo-50/15">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-900">
                โปรไฟล์เชิงลึก: {screeningData.candidate?.fullName}
              </h2>
              <p className="text-xs text-slate-600">
                {screeningData.candidate?.headline ||
                  screeningData.candidate?.targetCareer ||
                  'ผู้สมัครงาน'}{' '}
                • อีเมล: {screeningData.candidate?.email}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setScreeningData(null)}
              className="btn-secondary text-xs"
            >
              ปิดโปรไฟล์เชิงลึก
            </button>
          </div>

          {screeningData.candidate?.bio && (
            <div className="text-xs text-slate-700 bg-white p-3 rounded-lg border border-slate-200">
              <b>ข้อมูลแนะนำตัว (Bio):</b> {screeningData.candidate.bio}
            </div>
          )}

          <div className="grid md:grid-cols-2 gap-4 text-xs">
            <div className="bg-white p-3 rounded-lg border border-slate-200 space-y-1">
              <div className="font-bold text-slate-800">ทักษะที่ผ่านการประเมินมาตรฐาน (Assessed Skills)</div>
              {(screeningData.candidate?.assessedSkills || []).length === 0 ? (
                <p className="text-slate-500">ยังไม่มีผลสอบทักษะมาตรฐานกลาง</p>
              ) : (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {screeningData.candidate.assessedSkills.map((sk: any) => (
                    <span
                      key={sk.skillId}
                      className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 font-semibold"
                    >
                      {sk.skillName || sk.slug}: {sk.score}%
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-white p-3 rounded-lg border border-slate-200 space-y-1">
              <div className="font-bold text-slate-800">
                ประวัติการ تغییرสถานะใบสมัคร (Status History)
              </div>
              <div className="space-y-1">
                {(screeningData.application?.statusHistory || []).map((h: any) => (
                  <div key={h.id} className="text-slate-600">
                    • <b>{h.newStatus}</b> {h.note ? `(${h.note})` : ''}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {(screeningData.candidate?.githubRepos || []).length > 0 && (
            <div className="bg-white p-3 rounded-lg border border-slate-200 space-y-1.5 text-xs">
              <div className="font-bold text-slate-800">GitHub Repositories เด่นของผู้สมัคร</div>
              <div className="grid sm:grid-cols-2 gap-2">
                {screeningData.candidate.githubRepos.slice(0, 6).map((repo: any) => (
                  <a
                    key={repo.id}
                    href={repo.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-2 rounded border border-slate-100 hover:bg-slate-50 block"
                  >
                    <div className="font-semibold text-blue-600">{repo.repoName} ↗</div>
                    <div className="text-[11px] text-slate-500">
                      ภาษาหลัก: {repo.language || '-'} • ⭐ {repo.stargazersCount}
                    </div>
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Evaluation Form Modal */}
      {evaluatingApp && (
        <form
          onSubmit={handleSubmitEvaluation}
          className="card space-y-4 border-2 border-blue-500 bg-blue-50/20"
        >
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-900">
              ประเมินผลผู้สมัคร: {evaluatingApp.candidate?.fullName} ({evaluatingApp.job?.title})
            </h2>
            <button
              type="button"
              onClick={() => setEvaluatingApp(null)}
              className="btn-secondary text-xs"
            >
              ปิดหน้าต่างประเมิน
            </button>
          </div>

          <div className="grid md:grid-cols-4 gap-4">
            <div>
              <label className="label">ทักษะเทคนิค (1-5)</label>
              <input
                type="number"
                min={1}
                max={5}
                className="input"
                value={technicalScore}
                onChange={(e) => setTechnicalScore(Number(e.target.value))}
              />
            </div>
            <div>
              <label className="label">การแก้ปัญหา (1-5)</label>
              <input
                type="number"
                min={1}
                max={5}
                className="input"
                value={problemSolvingScore}
                onChange={(e) => setProblemSolvingScore(Number(e.target.value))}
              />
            </div>
            <div>
              <label className="label">การสื่อสาร (1-5)</label>
              <input
                type="number"
                min={1}
                max={5}
                className="input"
                value={communicationScore}
                onChange={(e) => setCommunicationScore(Number(e.target.value))}
              />
            </div>
            <div>
              <label className="label">การทำงานเป็นทีม (1-5)</label>
              <input
                type="number"
                min={1}
                max={5}
                className="input"
                value={teamworkScore}
                onChange={(e) => setTeamworkScore(Number(e.target.value))}
              />
            </div>
          </div>

          <div>
            <label className="label">ความเห็นโดยรวมจากผู้ประเมิน (Overall Feedback)</label>
            <textarea
              rows={2}
              className="input"
              placeholder="สรุปผลการสัมภาษณ์หรือพิจารณาผู้สมัคร..."
              value={overallFeedback}
              onChange={(e) => setOverallFeedback(e.target.value)}
              required
            />
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="label">จุดแข็งของผู้สมัคร (Strengths — แยกบรรทัดละ 1 ข้อ)</label>
              <textarea
                rows={2}
                className="input"
                placeholder="เช่น เข้าใจโครงสร้างระบบดี&#10;เขียนโค้ดสะอาด"
                value={strengths}
                onChange={(e) => setStrengths(e.target.value)}
              />
            </div>
            <div>
              <label className="label">คำแนะนำแนวทางพัฒนาเพิ่มเติม (Development Note)</label>
              <textarea
                rows={2}
                className="input"
                placeholder="เช่น แนะนำให้ทบทวนการออกแบบ Query และ Indexing"
                value={developmentNote}
                onChange={(e) => setDevelopmentNote(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className="label">
              ทักษะที่แนะนำให้ผู้สมัครไปพัฒนาต่อใน Learning Plan (เลือกได้สูงสุด 10 ทักษะ — เลือกแล้ว{' '}
              {devSkillIds.length} ทักษะ)
            </label>
            <div className="flex flex-wrap gap-2 p-3 rounded-xl bg-white border border-slate-200 max-h-40 overflow-y-auto">
              {masterSkills.map((sk) => {
                const selected = devSkillIds.includes(sk.id);
                return (
                  <button
                    key={sk.id}
                    type="button"
                    onClick={() => toggleDevSkill(sk.id)}
                    className={`px-2.5 py-1 rounded-full text-xs font-medium border transition ${
                      selected
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {selected ? '✓ ' : '+ '}
                    {sk.name}
                  </button>
                );
              })}
            </div>
          </div>

          <button type="submit" className="btn-primary">
            บันทึกและส่งผลประเมินให้ผู้สมัคร
          </button>
        </form>
      )}

      {loading ? (
        <div className="p-10 text-center text-slate-500">กำลังโหลดรายการใบสมัคร...</div>
      ) : applications.length === 0 ? (
        <div className="card text-center py-12 text-slate-500">ไม่พบรายการใบสมัครงาน</div>
      ) : (
        <div className="space-y-4">
          {applications.map((app) => {
            const matchScore = app.matchScoreAtApplication ?? app.matchScoreAtApply ?? null;
            return (
              <div key={app.id} className="card space-y-4">
                <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                  <div className="space-y-1.5 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="badge bg-blue-100 text-blue-800">{app.status}</span>
                      <span className="badge bg-slate-100 text-slate-700">
                        รอบที่ {app.roundNumber}
                      </span>
                      {matchScore !== null && (
                        <span className="badge bg-emerald-100 text-emerald-800">
                          Match ตอนสมัคร: {Math.round(Number(matchScore))}%
                        </span>
                      )}
                      {app.codingResult && (
                        <span className="badge bg-indigo-50 text-indigo-800">
                          ผลสอบปฏิบัติ ({app.codingResult.title}): {app.codingResult.percentage}%
                        </span>
                      )}
                    </div>
                    <h2 className="text-lg font-bold text-slate-900">
                      {app.candidate?.fullName} — สมัครตำแหน่ง {app.job?.title}
                    </h2>
                    <p className="text-xs text-slate-500">
                      อีเมล: {app.candidate?.user?.email} • GitHub:{' '}
                      {app.candidate?.githubUsername ? (
                        <a
                          href={`https://github.com/${app.candidate.githubUsername}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-semibold text-blue-600 hover:underline"
                        >
                          @{app.candidate.githubUsername} ↗
                        </a>
                      ) : (
                        '-'
                      )}
                      {app.resumeUrl && (
                        <>
                          {' '}
                          • เรซูเม่:{' '}
                          <a
                            href={app.resumeUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-semibold text-indigo-600 hover:underline"
                          >
                            เปิดดูไฟล์เรซูเม่ ↗
                          </a>
                        </>
                      )}
                    </p>

                    {app.coverLetter && (
                      <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200/80 text-xs text-slate-700">
                        <b>จดหมายแนะนำตัว (Cover Letter):</b> {app.coverLetter}
                      </div>
                    )}

                    {Array.isArray(app.candidate?.githubSkills) &&
                      app.candidate.githubSkills.length > 0 && (
                        <div className="flex flex-wrap items-center gap-1 pt-1">
                          <span className="text-[11px] font-medium text-slate-500">
                            GitHub Tech Stack (Context):
                          </span>
                          {app.candidate.githubSkills.slice(0, 8).map((gs: any) => (
                            <span
                              key={gs.skillId || gs.slug}
                              className="px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 text-[11px] font-medium"
                            >
                              {gs.name}
                            </span>
                          ))}
                          {app.candidate.githubSkills.length > 8 && (
                            <span className="text-[11px] text-slate-400">
                              +{app.candidate.githubSkills.length - 8} ทักษะ
                            </span>
                          )}
                        </div>
                      )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <button
                      type="button"
                      disabled={loadingScreening}
                      onClick={() => handleViewCandidateProfile(app.candidateId, app.id)}
                      className="btn-secondary text-xs"
                    >
                      ดูโปรไฟล์เชิงลึก
                    </button>

                    <select
                      className="input text-xs w-44"
                      value={app.status}
                      onChange={(e) => handleUpdateStatus(app.id, e.target.value)}
                    >
                      <option value="APPLIED">APPLIED</option>
                      <option value="REVIEWING">REVIEWING</option>
                      <option value="TECHNICAL_TEST">TECHNICAL_TEST (มอบหมายข้อสอบ)</option>
                      <option value="INTERVIEW">INTERVIEW</option>
                      <option value="OFFER">OFFER (ยื่นข้อเสนอ)</option>
                      <option value="ACCEPTED">ACCEPTED (รับเข้าทำงาน)</option>
                      <option value="REJECTED">REJECTED (ปฏิเสธ)</option>
                    </select>

                    <select
                      className="input text-xs w-48"
                      defaultValue=""
                      onChange={(e) => handleAssignAssessment(app.id, e.target.value)}
                    >
                      <option value="">+ มอบหมายข้อสอบบริษัท...</option>
                      {companyAssessments.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.title}
                        </option>
                      ))}
                    </select>

                    <button
                      type="button"
                      onClick={() => {
                        setEvaluatingApp(app);
                        if (app.evaluation) {
                          setTechnicalScore(app.evaluation.technicalScore ?? 4);
                          setProblemSolvingScore(app.evaluation.problemSolvingScore ?? 4);
                          setCommunicationScore(app.evaluation.communicationScore ?? 4);
                          setTeamworkScore(app.evaluation.teamworkScore ?? 4);
                          setOverallFeedback(app.evaluation.overallFeedback || '');
                          setStrengths(
                            Array.isArray(app.evaluation.strengths)
                              ? app.evaluation.strengths.join('\n')
                              : '',
                          );
                          const areas = app.evaluation.areasForImprovement as any;
                          setDevelopmentNote(areas?.developmentNote || '');
                          if (Array.isArray(areas?.skills) && areas.skills.length > 0) {
                            setDevSkillIds(
                              areas.skills.map((s: any) => s.skillId).filter(Boolean),
                            );
                          }
                        }
                      }}
                      className="btn-primary text-xs"
                    >
                      ประเมินผล 4 มิติ
                    </button>
                  </div>
                </div>

                {/* HR Note & Confidential Internal Note Row */}
                <div className="pt-3 border-t border-slate-100 grid md:grid-cols-3 gap-2 items-end">
                  <div>
                    <label className="label text-[11px] mb-1">
                      หมายเหตุประกอบการเปลี่ยนสถานะ (แสดงใน Timeline)
                    </label>
                    <input
                      type="text"
                      className="input text-xs"
                      placeholder="เช่น นัดสัมภาษณ์รอบ Technical..."
                      value={statusNotes[app.id] ?? ''}
                      onChange={(e) =>
                        setStatusNotes((prev) => ({ ...prev, [app.id]: e.target.value }))
                      }
                    />
                  </div>
                  <div>
                    <label className="label text-[11px] mb-1">
                      บันทึกภายในเฉพาะ HR (ผู้สมัครมองไม่เห็น)
                    </label>
                    <input
                      type="text"
                      className="input text-xs"
                      placeholder="บันทึกความเห็นภายในทีมคัดเลือก..."
                      value={internalNotes[app.id] ?? app.internalNote ?? ''}
                      onChange={(e) =>
                        setInternalNotes((prev) => ({ ...prev, [app.id]: e.target.value }))
                      }
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => handleSaveInternalNote(app)}
                    className="btn-secondary text-xs"
                  >
                    บันทึกหมายเหตุ HR
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function CompanyApplicationsPage() {
  return (
    <Suspense fallback={<div className="p-10 text-center text-slate-500">กำลังโหลด...</div>}>
      <CompanyApplicationsInner />
    </Suspense>
  );
}
