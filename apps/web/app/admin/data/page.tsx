'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import { AdminBanner, Pagination, useDebounce } from '@/components/admin/ui';

type DataTab = 'jobs' | 'companies' | 'applications';

export default function AdminDataBrowserPage() {
  const [tab, setTab] = useState<DataTab>('jobs');
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [items, setItems] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [pageCount, setPageCount] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const t = new URLSearchParams(window.location.search).get('tab');
      if (t === 'jobs' || t === 'companies' || t === 'applications') {
        setTab(t);
      }
    }
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('pageSize', String(pageSize));
      if (debouncedSearch.trim()) params.set('search', debouncedSearch.trim());
      if (statusFilter !== 'ALL') {
        if (tab === 'companies') params.set('verificationStatus', statusFilter);
        else params.set('status', statusFilter);
      }

      const res = await apiFetch<any>(`/admin/${tab}?${params.toString()}`);
      setItems(res?.items || []);
      setTotal(res?.total ?? 0);
      setPageCount(res?.pageCount ?? 1);
    } catch (err: any) {
      setError(err?.message || 'ไม่สามารถโหลดข้อมูลได้');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [tab, debouncedSearch, statusFilter, page, pageSize]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            ตรวจสอบข้อมูลระบบ (Platform Data Browser)
          </h1>
          <p className="text-sm text-slate-600">
            เรียกดูรายการตำแหน่งงาน บริษัท และใบสมัครงานทั้งหมดในระบบแบบอ่านอย่างเดียว (Read-only Governance View)
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            className="input w-64 text-xs"
            placeholder="ค้นหาชื่อตำแหน่งงาน บริษัท หรือผู้สมัคร..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
          <select
            className="input w-44 text-xs"
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
          >
            <option value="ALL">ทุกสถานะ (All)</option>
            {tab === 'jobs' && (
              <>
                <option value="ACTIVE">เปิดรับสมัคร (ACTIVE)</option>
                <option value="INACTIVE">ปิดรับแล้ว (INACTIVE)</option>
              </>
            )}
            {tab === 'companies' && (
              <>
                <option value="VERIFIED">VERIFIED</option>
                <option value="PENDING">PENDING</option>
                <option value="REJECTED">REJECTED</option>
              </>
            )}
            {tab === 'applications' && (
              <>
                <option value="APPLIED">APPLIED</option>
                <option value="REVIEWING">REVIEWING</option>
                <option value="INTERVIEW">INTERVIEW</option>
                <option value="TECHNICAL_TEST">TECHNICAL_TEST</option>
                <option value="OFFER">OFFER</option>
                <option value="ACCEPTED">ACCEPTED</option>
                <option value="REJECTED">REJECTED</option>
              </>
            )}
          </select>
        </div>
      </div>

      <div className="flex gap-2 border-b border-slate-200 pb-3" role="tablist">
        {[
          { key: 'jobs', label: 'ตำแหน่งงาน (Jobs)' },
          { key: 'companies', label: 'บริษัท (Companies)' },
          { key: 'applications', label: 'ใบสมัครงาน (Applications)' },
        ].map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => {
              setTab(t.key as DataTab);
              setStatusFilter('ALL');
              setPage(1);
            }}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition ${
              tab === t.key
                ? 'bg-blue-600 text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <AdminBanner error={error} onClear={() => setError('')} />

      <div className="card overflow-x-auto space-y-4">
        {loading ? (
          <div className="p-8 text-center text-slate-500">กำลังโหลดข้อมูล...</div>
        ) : items.length === 0 ? (
          <div className="p-8 text-center text-slate-500">ไม่พบรายการที่ตรงตามเงื่อนไข</div>
        ) : tab === 'jobs' ? (
          <table className="w-full text-xs text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 text-slate-600">
                <th className="py-2.5 px-3">ตำแหน่งงาน</th>
                <th className="py-2.5 px-3">บริษัท</th>
                <th className="py-2.5 px-3">แหล่งที่มา</th>
                <th className="py-2.5 px-3">สถานะ</th>
                <th className="py-2.5 px-3">ใบสมัคร</th>
                <th className="py-2.5 px-3">ดูรายละเอียด</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((j) => (
                <tr key={j.id} className="hover:bg-slate-50">
                  <td className="py-2.5 px-3 font-semibold text-slate-900">
                    {j.title}
                  </td>
                  <td className="py-2.5 px-3">{j.companyName}</td>
                  <td className="py-2.5 px-3">
                    <span className="badge bg-slate-100 text-slate-700">
                      {j.source}
                    </span>
                  </td>
                  <td className="py-2.5 px-3">
                    <span
                      className={`badge ${
                        j.isActive
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-slate-200 text-slate-700'
                      }`}
                    >
                      {j.isActive ? 'ACTIVE' : 'INACTIVE'}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 font-mono">
                    {j._count?.applications ?? 0}
                  </td>
                  <td className="py-2.5 px-3">
                    <Link
                      href={`/jobs/${j.id}`}
                      className="text-blue-600 hover:underline"
                    >
                      เปิดดู →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : tab === 'companies' ? (
          <table className="w-full text-xs text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 text-slate-600">
                <th className="py-2.5 px-3">ชื่อบริษัท</th>
                <th className="py-2.5 px-3">อุตสาหกรรม</th>
                <th className="py-2.5 px-3">อีเมลติดต่อ</th>
                <th className="py-2.5 px-3">สถานะยืนยัน</th>
                <th className="py-2.5 px-3">งาน / ข้อสอบ / สมาชิก</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((c) => (
                <tr key={c.id} className="hover:bg-slate-50">
                  <td className="py-2.5 px-3 font-semibold text-slate-900">
                    {c.name}
                  </td>
                  <td className="py-2.5 px-3">{c.industry || '-'}</td>
                  <td className="py-2.5 px-3">{c.contactEmail || '-'}</td>
                  <td className="py-2.5 px-3">
                    <span
                      className={`badge ${
                        c.verificationStatus === 'VERIFIED'
                          ? 'bg-emerald-100 text-emerald-800'
                          : c.verificationStatus === 'PENDING'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-red-100 text-red-700'
                      }`}
                    >
                      {c.verificationStatus}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 font-mono">
                    {c._count?.jobs ?? 0} / {c._count?.assessments ?? 0} /{' '}
                    {c._count?.members ?? 0}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <table className="w-full text-xs text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 text-slate-600">
                <th className="py-2.5 px-3">ผู้สมัคร</th>
                <th className="py-2.5 px-3">ตำแหน่งงาน & บริษัท</th>
                <th className="py-2.5 px-3">คะแนน Match</th>
                <th className="py-2.5 px-3">สถานะ</th>
                <th className="py-2.5 px-3">วันที่สมัคร</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((app) => (
                <tr key={app.id} className="hover:bg-slate-50">
                  <td className="py-2.5 px-3">
                    <div className="font-semibold text-slate-900">
                      {app.candidate?.fullName || '-'}
                    </div>
                    <div className="text-[11px] text-slate-500">
                      {app.candidate?.user?.email || ''}
                    </div>
                  </td>
                  <td className="py-2.5 px-3">
                    <div className="font-semibold">{app.job?.title || '-'}</div>
                    <div className="text-[11px] text-slate-500">
                      {app.job?.companyName || ''}
                    </div>
                  </td>
                  <td className="py-2.5 px-3 font-mono">
                    {typeof app.matchScoreAtApplication === 'number'
                      ? `${app.matchScoreAtApplication.toFixed(1)}%`
                      : '-'}
                  </td>
                  <td className="py-2.5 px-3">
                    <span className="badge bg-blue-50 text-blue-700">
                      {app.status}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-slate-500">
                    {new Date(app.createdAt).toLocaleDateString('th-TH')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <Pagination
          page={page}
          pageCount={pageCount}
          total={total}
          pageSize={pageSize}
          onPageChange={setPage}
        />
      </div>
    </div>
  );
}
