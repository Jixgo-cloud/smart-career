'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import {
  CompanyLogo,
  resolveJobLogoUrl,
  getCompanyDisplayName,
} from '@/components/CompanyLogo';

export default function JobDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const jobId = params.id as string;

  const [job, setJob] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [coverLetter, setCoverLetter] = useState('');
  const [applying, setApplying] = useState(false);
  const [togglingFavorite, setTogglingFavorite] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const loadJob = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch<any>(`/jobs/${jobId}/detail`);
      setJob(res);
    } catch (err: any) {
      setError(err.message || 'ไม่พบข้อมูลตำแหน่งงาน');
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => {
    if (jobId) loadJob();
  }, [jobId, loadJob]);

  const handleToggleFavorite = async () => {
    if (!user) {
      router.push('/login');
      return;
    }
    if (togglingFavorite || !job) return;
    setTogglingFavorite(true);
    const prevFavorited = Boolean(job.isFavorited);
    setJob((prev: any) => (prev ? { ...prev, isFavorited: !prevFavorited } : prev));
    try {
      const res = await apiFetch<{ isFavorited: boolean }>(`/jobs/${jobId}/favorite`, {
        method: 'POST',
      });
      if (typeof res?.isFavorited === 'boolean') {
        setJob((prev: any) => (prev ? { ...prev, isFavorited: res.isFavorited } : prev));
      }
    } catch {
      setJob((prev: any) => (prev ? { ...prev, isFavorited: prevFavorited } : prev));
    } finally {
      setTogglingFavorite(false);
    }
  };

  const handleApplyInternal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      router.push('/login');
      return;
    }
    setApplying(true);
    setError('');
    setMessage('');
    try {
      await apiFetch(`/applications/${jobId}/apply`, {
        method: 'POST',
        body: JSON.stringify({ coverLetter }),
      });
      setMessage('ส่งใบสมัครงานเรียบร้อยแล้ว! ระบบบันทึก Snapshot คะแนนทักษะของคุณแล้ว');
      setCoverLetter('');
      await loadJob();
    } catch (err: any) {
      setError(err.message || 'ไม่สามารถส่งใบสมัครได้');
    } finally {
      setApplying(false);
    }
  };

  if (loading) {
    return <div className="p-10 text-center text-slate-500">กำลังโหลดรายละเอียดงาน...</div>;
  }

  if (!job) {
    return (
      <div className="card text-center py-12 space-y-4">
        <p className="text-red-600 font-semibold">{error || 'ไม่พบตำแหน่งงาน'}</p>
        <Link href="/jobs" className="btn-secondary">
          กลับหน้ารวมตำแหน่งงาน
        </Link>
      </div>
    );
  }

  const isExternal =
    typeof job.isExternal === 'boolean'
      ? job.isExternal
      : (job.source && job.source !== 'INTERNAL') || Boolean(job.sourceUrl);

  const match =
    job.matchAssessment ||
    job.match ||
    (job.matchScore && typeof job.matchScore === 'object' ? job.matchScore : null);

  const overallMatchScore =
    match?.matchScore !== null && match?.matchScore !== undefined
      ? Math.round(Number(match.matchScore))
      : match?.overallScore !== null && match?.overallScore !== undefined
        ? Math.round(Number(match.overallScore))
        : null;

  const myApplication = job.myApplication || null;
  const hasActiveApplication =
    Boolean(myApplication) &&
    myApplication.status !== 'CANCELLED' &&
    myApplication.status !== 'REJECTED';

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <Link href="/jobs" className="text-sm font-medium text-blue-600 hover:underline">
          ← กลับหน้ารวมตำแหน่งงาน
        </Link>

        <button
          type="button"
          onClick={handleToggleFavorite}
          disabled={togglingFavorite}
          className={`px-3.5 py-1.5 rounded-full border text-xs font-semibold flex items-center gap-1.5 transition ${
            job.isFavorited
              ? 'bg-rose-50 border-rose-200 text-rose-600 hover:bg-rose-100'
              : 'bg-white border-slate-200 text-slate-600 hover:border-rose-300 hover:text-rose-500'
          }`}
        >
          <svg
            className="w-3.5 h-3.5 fill-current"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={job.isFavorited ? '0' : '2'}
          >
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
          </svg>
          {job.isFavorited ? 'บันทึกในงานโปรดแล้ว' : 'บันทึกงานโปรด'}
        </button>
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

      <div className="card space-y-6">
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 border-b border-slate-100 pb-6">
          <div className="flex items-start gap-4">
            <CompanyLogo
              logoUrl={resolveJobLogoUrl(job)}
              companyName={getCompanyDisplayName(job)}
              size="lg"
            />
            <div className="space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="badge bg-blue-50 text-blue-700">
                  {job.jobType || job.employmentType || 'FULL_TIME'}
                </span>
                {isExternal ? (
                  <span className="badge bg-amber-100 text-amber-800">
                    ตำแหน่งงานจากแหล่งภายนอก ({job.source || 'External Source'})
                  </span>
                ) : (
                  <span className="badge bg-emerald-100 text-emerald-800">
                    รับสมัครตรงบน SmartCareer
                  </span>
                )}
                {!job.isActive && (
                  <span className="badge bg-red-100 text-red-700">ปิดรับสมัครแล้ว</span>
                )}
              </div>
              <h1 className="text-2xl md:text-3xl font-bold text-slate-900">{job.title}</h1>
              <p className="text-slate-600 font-medium">
                {getCompanyDisplayName(job)} • {job.location || 'ไม่ระบุสถานที่'}
              </p>
              <p className="text-sm text-slate-500">
                เงินเดือน:{' '}
                {job.salaryMin && job.salaryMax
                  ? `฿${job.salaryMin.toLocaleString()} - ฿${job.salaryMax.toLocaleString()}`
                  : job.salaryMin
                    ? `฿${job.salaryMin.toLocaleString()}+`
                    : job.salaryMax
                      ? `สูงสุด ฿${job.salaryMax.toLocaleString()}`
                      : 'ตามตกลง'}{' '}
                {job.acceptedQuota
                  ? `• โควต้ารับเข้าทำงาน: ${job.acceptedCount ?? 0}/${job.acceptedQuota} อัตรา`
                  : ''}
              </p>
            </div>
          </div>

          {match && (
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-right space-y-1 shrink-0">
              <div className="text-xs text-slate-500 uppercase font-semibold">
                คะแนนความสอดคล้อง (Job Match)
              </div>
              {match.status === 'AWAITING_ASSESSMENT' || overallMatchScore === null ? (
                <div className="text-sm font-bold text-slate-700">
                  รอข้อมูลทักษะจาก GitHub หรือผลสอบ
                </div>
              ) : (
                <div className="text-2xl font-extrabold text-blue-700">
                  Match {overallMatchScore}%
                </div>
              )}
              <div className="text-xs text-slate-600">
                ทักษะที่ตรงกับตำแหน่งงาน:{' '}
                <span className="font-semibold">
                  {match.assessedSkillCount ?? match.matchedSkills?.length ?? 0}/
                  {match.totalJobSkillCount ?? (job.skills || []).length} ทักษะ
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Job Description */}
        <div className="space-y-3">
          <h2 className="text-lg font-bold text-slate-900">รายละเอียดงาน</h2>
          <p className="text-slate-700 whitespace-pre-line text-sm leading-relaxed">
            {job.description}
          </p>
        </div>

        {/* Job Requirements */}
        {job.requirements && (
          <div className="space-y-3">
            <h2 className="text-lg font-bold text-slate-900">คุณสมบัติผู้สมัคร (Requirements)</h2>
            <p className="text-slate-700 whitespace-pre-line text-sm leading-relaxed">
              {job.requirements}
            </p>
          </div>
        )}

        {/* Job Benefits */}
        {job.benefits && (
          <div className="space-y-3">
            <h2 className="text-lg font-bold text-slate-900">สวัสดิการ (Benefits)</h2>
            <p className="text-slate-700 whitespace-pre-line text-sm leading-relaxed">
              {job.benefits}
            </p>
          </div>
        )}

        {/* Required & Preferred Skills */}
        <div className="space-y-3">
          <h2 className="text-lg font-bold text-slate-900">ทักษะที่ต้องการสำหรับตำแหน่งงานนี้</h2>
          {(job.skills || []).length === 0 ? (
            <p className="text-sm text-slate-500">ไม่ระบุเกณฑ์ทักษะเฉพาะเจาะจง</p>
          ) : (
            <div className="grid md:grid-cols-2 gap-3">
              {(job.skills || []).map((js: any) => (
                <div
                  key={js.id || js.skillId}
                  className="flex items-center justify-between p-3 rounded-lg border border-slate-200 bg-slate-50 text-sm"
                >
                  <span className="font-semibold text-slate-900">{js.skill?.name}</span>
                  <span
                    className={`badge ${
                      js.isRequired
                        ? 'bg-blue-100 text-blue-800'
                        : 'bg-slate-200 text-slate-700'
                    }`}
                  >
                    {js.isRequired ? 'ทักษะบังคับ (Required)' : 'ทักษะเสริม (Preferred)'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Match Breakdown for logged-in candidate */}
        {match && (
          <div className="p-5 rounded-xl bg-blue-50/50 border border-blue-100 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <h3 className="font-bold text-slate-900">
                วิเคราะห์ทักษะของคุณเทียบกับตำแหน่งงานนี้ (อ้างอิงจาก GitHub และผลสอบเสริม)
              </h3>
              <Link href="/profile" className="text-xs font-semibold text-blue-600 hover:underline">
                อัปเดตข้อมูล GitHub ในโปรไฟล์ →
              </Link>
            </div>
            <div className="grid md:grid-cols-2 gap-4 text-sm">
              <div className="bg-white p-3.5 rounded-lg border border-emerald-200 space-y-2">
                <div className="font-semibold text-emerald-800">
                  ทักษะที่คุณมีตรงกับงานนี้ ({match.matchedSkills?.length || 0})
                </div>
                {(match.matchedSkills || []).length === 0 ? (
                  <p className="text-xs text-slate-400">ยังไม่มีทักษะที่ตรงกับตำแหน่งงานนี้</p>
                ) : (
                  (match.matchedSkills || []).map((s: any) => {
                    const name = s.name || s.skillName;
                    return (
                      <div
                        key={s.skillId || name}
                        className="text-xs text-slate-700 flex flex-wrap items-center justify-between gap-1 py-1 border-b border-slate-100 last:border-0"
                      >
                        <span className="font-semibold text-slate-800">
                          {name}{' '}
                          <span className="text-[11px] font-normal text-slate-400">
                            ({s.isRequired === false ? 'เสริม' : 'บังคับ'})
                          </span>
                        </span>
                        <div className="flex flex-wrap items-center gap-1.5">
                          {s.hasGithubEvidence && (
                            <span className="px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200/70 font-semibold text-[11px]">
                              ✓ พบใน GitHub ({s.githubRepoCount || 1} โปรเจกต์)
                            </span>
                          )}
                          {s.examScore !== null && s.examScore !== undefined && (
                            <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-mono font-semibold text-[11px]">
                              คะแนนสอบเสริม {s.examScore}%
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              <div className="bg-white p-3.5 rounded-lg border border-amber-200 space-y-2">
                <div className="font-semibold text-amber-800">
                  ทักษะที่ยังขาดสำหรับงานนี้ (
                  {(match.missingSkills?.length || 0) + (match.unassessedSkills?.length || 0)})
                </div>
                {[...(match.missingSkills || []), ...(match.unassessedSkills || [])].length ===
                0 ? (
                  <p className="text-xs text-emerald-700 font-medium">
                    ✓ คุณมีทักษะครบตามที่ตำแหน่งงานนี้ต้องการแล้ว!
                  </p>
                ) : (
                  [...(match.missingSkills || []), ...(match.unassessedSkills || [])].map(
                    (s: any) => {
                      const name = s.name || s.skillName;
                      return (
                        <div
                          key={s.skillId || name}
                          className="text-xs text-slate-700 flex flex-wrap items-center justify-between gap-2 py-1 border-b border-slate-100 last:border-0"
                        >
                          <span>
                            <b className="text-slate-800">{name}</b>{' '}
                            <span className="text-[11px] text-slate-400">
                              ({s.isRequired === false ? 'เสริม' : 'บังคับ'})
                            </span>
                          </span>
                          <div className="flex items-center gap-2">
                            <Link
                              href="/courses"
                              className="text-amber-700 font-semibold hover:underline"
                            >
                              ดูคอร์สเรียน →
                            </Link>
                            <span className="text-slate-300">|</span>
                            <Link
                              href="/assessments"
                              className="text-blue-600 font-semibold hover:underline"
                            >
                              สอบยืนยัน →
                            </Link>
                          </div>
                        </div>
                      );
                    },
                  )
                )}
              </div>
            </div>
          </div>
        )}

        {/* Application Section */}
        <div className="pt-4 border-t border-slate-200">
          {!job.isActive ? (
            <div className="p-4 rounded-xl bg-slate-100 text-slate-600 text-center text-sm font-medium">
              ตำแหน่งงานนี้ปิดรับสมัครแล้ว
            </div>
          ) : isExternal ? (
            <div className="p-5 rounded-xl bg-amber-50 border border-amber-200 flex flex-col md:flex-row items-center justify-between gap-4">
              <div className="space-y-1">
                <h3 className="font-bold text-amber-900">
                  ตำแหน่งงานนี้รับสมัครผ่านเว็บไซต์ต้นทางภายนอก ({job.source || 'External Job'})
                </h3>
                <p className="text-xs text-amber-800">
                  ระบบไม่อนุญาตให้ส่งใบสมัครภายในแพลตฟอร์มสำหรับงานภายนอก กรุณาคลิกไปสมัครที่เว็บไซต์ต้นทางโดยตรง
                </p>
              </div>
              {job.sourceUrl ? (
                <a
                  href={job.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-primary shrink-0"
                >
                  สมัครงานที่เว็บไซต์ต้นทาง ↗
                </a>
              ) : (
                <span className="badge bg-slate-200 text-slate-700">ไม่ระบุลิงก์ต้นทาง</span>
              )}
            </div>
          ) : hasActiveApplication ? (
            <div className="p-5 rounded-xl bg-emerald-50 border border-emerald-200 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="badge bg-emerald-100 text-emerald-800">
                    คุณสมัครตำแหน่งนี้แล้ว (สถานะ: {myApplication.status})
                  </span>
                  <span className="badge bg-white text-slate-700 border border-emerald-200">
                    รอบที่ {myApplication.roundNumber}
                  </span>
                </div>
                <p className="text-xs text-emerald-900 pt-1">
                  คุณสามารถติดตามความคืบหน้าของใบสมัคร ทำแบบทดสอบเฉพาะตำแหน่ง หรือดูผลประเมินจากบริษัทได้ที่หน้าประวัติการสมัครงาน
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {myApplication.assignedAssessmentId && (
                  <Link
                    href={`/assessments/${myApplication.assignedAssessmentId}?applicationId=${myApplication.id}`}
                    className="btn-primary text-xs"
                  >
                    ทำข้อสอบเฉพาะตำแหน่ง →
                  </Link>
                )}
                <Link href="/applications" className="btn-secondary text-xs">
                  ดูใบสมัครของฉัน →
                </Link>
              </div>
            </div>
          ) : (
            <form onSubmit={handleApplyInternal} className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-slate-900">สมัครงานตำแหน่งนี้บน SmartCareer</h3>
                {myApplication && (
                  <span className="text-xs text-slate-500">
                    ใบสมัครรอบก่อนหน้า ({myApplication.status}) • สมัครใหม่ในรอบที่{' '}
                    {(myApplication.roundNumber || 1) + 1}
                  </span>
                )}
              </div>
              <div>
                <label className="label">ข้อความแนะนำตัวถึงผู้ประกอบการ (Cover Letter)</label>
                <textarea
                  rows={3}
                  className="input"
                  placeholder="ระบุเหตุผลที่สนใจตำแหน่งงานนี้และจุดเด่นของคุณ..."
                  value={coverLetter}
                  onChange={(e) => setCoverLetter(e.target.value)}
                />
              </div>
              <button type="submit" disabled={applying} className="btn-primary">
                {applying ? 'กำลังส่งใบสมัคร...' : 'ยืนยันการส่งใบสมัครงาน'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
