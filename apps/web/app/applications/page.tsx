'use client';

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import {
  CompanyLogo,
  resolveJobLogoUrl,
  getCompanyDisplayName,
} from '@/components/CompanyLogo';

export default function MyApplicationsPage() {
  const [applications, setApplications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadApplications = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch<any[]>('/candidate/applications');
      setApplications(res || []);
    } catch (err: any) {
      setError(err.message || 'ไม่สามารถดึงข้อมูลใบสมัครงานได้');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadApplications();
  }, [loadApplications]);

  const handleCancel = async (id: string) => {
    try {
      await apiFetch(`/applications/${id}`, { method: 'DELETE' });
      await loadApplications();
    } catch (err: any) {
      alert(err.message || 'ไม่สามารถยกเลิกใบสมัครได้');
    }
  };

  if (loading) {
    return <div className="p-10 text-center text-slate-500">กำลังโหลดประวัติการสมัครงาน...</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">ประวัติการสมัครงานของฉัน</h1>
        <p className="text-sm text-slate-600">
          ติดตามสถานะใบสมัคร รอบการสมัคร (Round) แบบทดสอบเฉพาะตำแหน่ง และผลประเมินจากบริษัท
        </p>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
          {error}
        </div>
      )}

      {applications.length === 0 ? (
        <div className="card text-center py-12 space-y-4">
          <p className="text-slate-500">คุณยังไม่มีรายการสมัครงาน</p>
          <Link href="/jobs" className="btn-primary inline-block">
            ค้นหาตำแหน่งงาน
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {applications.map((app) => {
            const matchScore = app.matchScoreAtApplication ?? app.matchScoreAtApply ?? null;
            const appliedDate = app.createdAt || app.appliedAt;
            const ev = app.evaluation || app.evaluations?.[0] || null;
            const avgEvalScore = ev
              ? ev.overallScore !== undefined
                ? `${ev.overallScore}%`
                : `${(
                    ((Number(ev.technicalScore || 0) +
                      Number(ev.problemSolvingScore || 0) +
                      Number(ev.communicationScore || 0) +
                      Number(ev.teamworkScore ?? ev.cultureFitScore ?? 0)) /
                      4)
                  ).toFixed(1)} / 5.0`
              : null;

            return (
              <div key={app.id} className="card space-y-4">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
                  <div className="flex items-start gap-3">
                    <CompanyLogo
                      logoUrl={resolveJobLogoUrl(app.job)}
                      companyName={getCompanyDisplayName(app.job)}
                      size="md"
                    />
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="badge bg-blue-100 text-blue-800">
                          สถานะ: {app.status}
                        </span>
                        <span className="badge bg-slate-100 text-slate-700">
                          รอบที่ {app.roundNumber}
                        </span>
                        {matchScore !== null && (
                          <span className="badge bg-emerald-50 text-emerald-700">
                            Match ตอนสมัคร: {Math.round(Number(matchScore))}%
                          </span>
                        )}
                      </div>
                      <h2 className="text-lg font-bold text-slate-900 mt-1">
                        <Link href={`/jobs/${app.jobId}`} className="hover:underline">
                          {app.job?.title || 'ตำแหน่งงาน'}
                        </Link>
                      </h2>
                      <p className="text-xs text-slate-500">
                        {getCompanyDisplayName(app.job)} • สมัครเมื่อ{' '}
                        {appliedDate
                          ? new Date(appliedDate).toLocaleString('th-TH')
                          : '-'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {app.assignedAssessmentId && (
                      <Link
                        href={`/assessments/${app.assignedAssessmentId}?applicationId=${app.id}`}
                        className="btn-primary text-xs"
                      >
                        ทำข้อสอบเฉพาะตำแหน่ง ({app.assignedAssessment?.title || 'Assessment'})
                      </Link>
                    )}
                    {!['ACCEPTED', 'REJECTED', 'CANCELLED'].includes(app.status) && (
                      <button
                        onClick={() => handleCancel(app.id)}
                        className="btn-danger text-xs"
                      >
                        ยกเลิกใบสมัคร
                      </button>
                    )}
                  </div>
                </div>

                {ev && (
                  <div className="p-3.5 rounded-lg bg-emerald-50 border border-emerald-200 text-xs flex items-center justify-between">
                    <span className="text-emerald-900 font-medium">
                      บริษัทได้ส่งผลประเมินและข้อเสนอแนะสำหรับพัฒนาทักษะแล้ว (คะแนนเฉลี่ย:{' '}
                      {avgEvalScore})
                    </span>
                    <Link href="/learning-plan" className="font-bold text-emerald-800 underline">
                      ดูผลประเมินใน Learning Plan →
                    </Link>
                  </div>
                )}

                {app.statusHistory?.length > 0 && (
                  <div className="border-t border-slate-100 pt-3">
                    <div className="text-xs font-semibold text-slate-500 mb-1.5">
                      ประวัติการเปลี่ยนสถานะ
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {app.statusHistory.map((h: any) => (
                        <span key={h.id} className="badge bg-slate-100 text-slate-600">
                          {h.newStatus || h.toStatus} (
                          {new Date(h.createdAt).toLocaleDateString('th-TH')})
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
