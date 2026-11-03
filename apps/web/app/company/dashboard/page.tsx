'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';

export default function CompanyDashboardPage() {
  const [profile, setProfile] = useState<any>(null);
  const [jobs, setJobs] = useState<any[]>([]);
  const [applications, setApplications] = useState<any[]>([]);
  const [assessments, setAssessments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      apiFetch<any>('/company/profile').catch(() => null),
      apiFetch<any[]>('/company/jobs').catch(() => []),
      apiFetch<any[]>('/company/applications').catch(() => []),
      apiFetch<any[]>('/company/assessments').catch(() => []),
    ])
      .then(([prof, jb, app, ass]) => {
        setProfile(prof);
        setJobs(Array.isArray(jb) && jb.length > 0 ? jb : prof?.jobs || []);
        setApplications(app || []);
        setAssessments(ass || []);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="p-10 text-center text-slate-500">กำลังโหลดแดชบอร์ดบริษัท...</div>;
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900">
              แดชบอร์ดบริษัท: {profile?.name || profile?.companyName || 'องค์กรของคุณ'}
            </h1>
            <span
              className={`badge ${
                profile?.verificationStatus === 'VERIFIED'
                  ? 'bg-emerald-100 text-emerald-800'
                  : profile?.verificationStatus === 'PENDING'
                  ? 'bg-amber-100 text-amber-800'
                  : 'bg-slate-200 text-slate-700'
              }`}
            >
              สถานะยืนยันองค์กร: {profile?.verificationStatus || 'UNVERIFIED'}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <Link href="/company/jobs/new" className="btn-primary">
            + ประกาศตำแหน่งงานใหม่
          </Link>
          <Link href="/company/profile" className="btn-secondary">
            ตั้งค่าองค์กร / ยืนยันนิติบุคคล
          </Link>
        </div>
      </div>

      {profile?.verificationStatus !== 'VERIFIED' && (
        <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="text-sm text-amber-900">
            <b>แจ้งเตือน:</b> บริษัทจะต้องได้รับการอนุมัติยืนยันตัวตนนิติบุคคล (VERIFIED) ก่อนจึงจะสามารถประกาศตำแหน่งงานใหม่ได้
            {profile?.verificationRejectionReason && (
              <div className="text-red-700 mt-1">
                เหตุผลที่ไม่ผ่านการอนุมัติล่าสุด: {profile.verificationRejectionReason}
              </div>
            )}
          </div>
          <Link href="/company/profile" className="btn-primary text-xs shrink-0 self-start sm:self-auto">
            ส่งเอกสารยืนยันตัวตน →
          </Link>
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        <div className="card space-y-1">
          <div className="text-xs text-slate-500">ตำแหน่งงานทั้งหมด</div>
          <div className="text-3xl font-extrabold text-slate-900">{jobs.length}</div>
          <Link href="/company/jobs" className="text-xs text-blue-600 hover:underline">
            จัดการตำแหน่งงาน →
          </Link>
        </div>
        <div className="card space-y-1">
          <div className="text-xs text-slate-500">ใบสมัครทั้งหมด</div>
          <div className="text-3xl font-extrabold text-blue-700">{applications.length}</div>
          <Link href="/company/applications" className="text-xs text-blue-600 hover:underline">
            ตรวจใบสมัครและประเมินผล →
          </Link>
        </div>
        <div className="card space-y-1">
          <div className="text-xs text-slate-500">ข้อสอบคัดเลือกของบริษัท</div>
          <div className="text-3xl font-extrabold text-indigo-700">{assessments.length}</div>
          <Link href="/company/assessments" className="text-xs text-blue-600 hover:underline">
            จัดการข้อสอบและตรวจคำตอบ →
          </Link>
        </div>
        <div className="card space-y-1">
          <div className="text-xs text-slate-500">รับเข้าทำงานแล้ว (Accepted)</div>
          <div className="text-3xl font-extrabold text-emerald-700">
            {applications.filter((a) => a.status === 'ACCEPTED').length}
          </div>
          <span className="text-xs text-slate-400">อัปเดตโควต้าอัตโนมัติ</span>
        </div>
      </div>
    </div>
  );
}
