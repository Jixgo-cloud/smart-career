'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import { AdminBanner } from '@/components/admin/ui';

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    apiFetch<any>('/admin/dashboard')
      .then((res) => setStats(res))
      .catch((err: any) => setError(err?.message || 'ไม่สามารถโหลดข้อมูลแดชบอร์ดได้'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="p-10 text-center text-slate-500">กำลังโหลดข้อมูลระบบ...</div>;
  }

  const recentLogs: any[] = Array.isArray(stats?.recentIngestionLogs)
    ? stats.recentIngestionLogs.slice(0, 5)
    : [];

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            ศูนย์ควบคุมระบบ (Admin Control Center)
          </h1>
          <p className="text-sm text-slate-600">
            กำกับดูแลผู้ใช้งาน ทักษะมาตรฐาน คลังข้อสอบกลาง การยืนยันตัวตนบริษัท ข้อมูลงาน/คอร์สเรียน และบันทึก Audit
          </p>
        </div>
      </div>

      <AdminBanner error={error} onClear={() => setError('')} />

      {/* Primary Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="card space-y-1">
          <div className="text-xs text-slate-500">ผู้ใช้งานทั้งหมด</div>
          <div className="text-2xl font-extrabold text-slate-900">
            {stats?.totalUsers ?? 0}
          </div>
          <div className="text-[11px] text-slate-500">
            ผู้สมัคร {stats?.candidates ?? 0} • บริษัท {stats?.companies ?? 0}
          </div>
          <Link href="/admin/users" className="text-xs text-blue-600 hover:underline block">
            จัดการผู้ใช้ →
          </Link>
        </div>

        <div className="card space-y-1">
          <div className="text-xs text-slate-500">บริษัทรอตรวจสอบ (Pending Verification)</div>
          <div className="text-2xl font-extrabold text-amber-600">
            {stats?.pendingVerifications ?? 0}
          </div>
          <div className="text-[11px] text-slate-500">
            บริษัททั้งหมดในระบบ {stats?.companies ?? 0} แห่ง
          </div>
          <Link
            href="/admin/verifications"
            className="text-xs text-blue-600 hover:underline block"
          >
            ตรวจสอบนิติบุคคล →
          </Link>
        </div>

        <div className="card space-y-1">
          <div className="text-xs text-slate-500">ทักษะมาตรฐาน (Master Skills)</div>
          <div className="text-2xl font-extrabold text-indigo-700">
            {stats?.totalSkills ?? 0}
          </div>
          <div className="text-[11px] text-slate-500">ครอบคลุม 11 หมวดทักษะ</div>
          <Link href="/admin/skills" className="text-xs text-blue-600 hover:underline block">
            จัดการทักษะ →
          </Link>
        </div>

        <div className="card space-y-1">
          <div className="text-xs text-slate-500">ข้อสอบทั้งหมด / การเข้าสอบ</div>
          <div className="text-2xl font-extrabold text-emerald-700">
            {stats?.totalAssessments ?? 0} / {stats?.totalAttempts ?? 0}
          </div>
          <div className="text-[11px] text-slate-500">คลังข้อสอบกลาง & บริษัท</div>
          <Link
            href="/admin/assessments"
            className="text-xs text-blue-600 hover:underline block"
          >
            คลังข้อสอบกลาง →
          </Link>
        </div>

        <div className="card space-y-1">
          <div className="text-xs text-slate-500">ตำแหน่งงาน (Jobs เปิดรับ / ทั้งหมด)</div>
          <div className="text-2xl font-extrabold text-blue-700">
            {stats?.activeJobs ?? 0} / {stats?.jobs ?? 0}
          </div>
          <Link href="/admin/data" className="text-xs text-blue-600 hover:underline block">
            ดูรายการตำแหน่งงาน →
          </Link>
        </div>

        <div className="card space-y-1">
          <div className="text-xs text-slate-500">ใบสมัครงานทั้งหมด (Applications)</div>
          <div className="text-2xl font-extrabold text-purple-700">
            {stats?.applications ?? 0}
          </div>
          <Link
            href="/admin/data?tab=applications"
            className="text-xs text-blue-600 hover:underline block"
          >
            ดูใบสมัครงาน →
          </Link>
        </div>

        <div className="card space-y-1">
          <div className="text-xs text-slate-500">คอร์สเรียนในคลัง (Courses)</div>
          <div className="text-2xl font-extrabold text-teal-700">
            {stats?.courses ?? 0}
          </div>
          <Link
            href="/admin/ingestion"
            className="text-xs text-blue-600 hover:underline block"
          >
            จัดการคอร์ส & Ingestion →
          </Link>
        </div>

        <div className="card space-y-1">
          <div className="text-xs text-slate-500">ประวัติ Ingestion ล่าสุด &amp; Audit</div>
          <div className="text-2xl font-extrabold text-slate-800">
            {stats?.recentIngestionLogs?.length ?? 0}
          </div>
          <div className="text-[11px] text-slate-500">บันทึกทุกการเปลี่ยนแปลง</div>
          <Link
            href="/admin/audit-logs"
            className="text-xs text-blue-600 hover:underline block"
          >
            ดู Audit Logs →
          </Link>
        </div>
      </div>

      {/* Quick Admin Modules */}
      <div className="grid md:grid-cols-3 gap-6">
        <Link
          href="/admin/verifications"
          className="card hover:border-blue-400 transition space-y-2"
        >
          <h2 className="font-bold text-slate-900">อนุมัติการยืนยันตัวตนบริษัท</h2>
          <p className="text-xs text-slate-600">
            ตรวจสอบเลขทะเบียนนิติบุคคล 13 หลักและเปิดดูเอกสารรับรองบริษัทเพื่ออนุมัติหรือปฏิเสธพร้อมระบุเหตุผล
          </p>
        </Link>

        <Link
          href="/admin/assessments"
          className="card hover:border-blue-400 transition space-y-2"
        >
          <h2 className="font-bold text-slate-900">ธรรมาภิบาลคลังข้อสอบกลาง</h2>
          <p className="text-xs text-slate-600">
            สร้าง แก้ไข เผยแพร่ (PUBLISHED) ยกเลิก (RETIRED) ตั้งค่านโยบายการเปิดเผยเฉลย และดูผลการเข้าสอบ
          </p>
        </Link>

        <Link
          href="/admin/ingestion"
          className="card hover:border-blue-400 transition space-y-2"
        >
          <h2 className="font-bold text-slate-900">
            ระบบดึงงานและคอร์สเรียน (Data Ingestion)
          </h2>
          <p className="text-xs text-slate-600">
            สั่งรันงานดึงข้อมูล ตั้งค่า Quota พรีวิวก่อนนำเข้า Backfill ทักษะ และทำความสะอาดงาน/คอร์สที่ปิดแล้ว
          </p>
        </Link>
      </div>

      {/* Recent Ingestion Logs Preview */}
      <div className="card space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-900">
            ประวัติการดึงข้อมูลล่าสุด (Recent Ingestion Logs)
          </h2>
          <Link href="/admin/ingestion" className="text-xs text-blue-600 hover:underline">
            ดูทั้งหมด →
          </Link>
        </div>
        {recentLogs.length === 0 ? (
          <div className="text-xs text-slate-500 py-4 text-center">
            ยังไม่มีประวัติการดึงข้อมูล
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-slate-600">
                  <th className="py-2 px-3">แหล่งข้อมูล</th>
                  <th className="py-2 px-3">สถานะ</th>
                  <th className="py-2 px-3">Created / Updated / Duplicate</th>
                  <th className="py-2 px-3">เวลา</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {recentLogs.map((r: any) => (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <td className="py-2 px-3 font-semibold">{r.source}</td>
                    <td className="py-2 px-3">
                      <span
                        className={`badge ${
                          r.status === 'SUCCESS'
                            ? 'bg-emerald-100 text-emerald-800'
                            : r.status === 'FAILED'
                              ? 'bg-red-100 text-red-700'
                              : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {r.status}
                      </span>
                    </td>
                    <td className="py-2 px-3 font-mono">
                      {r.createdCount} / {r.updatedCount} / {r.duplicateCount}
                    </td>
                    <td className="py-2 px-3 text-slate-500">
                      {new Date(r.startedAt).toLocaleString('th-TH')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
