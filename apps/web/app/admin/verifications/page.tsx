'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { apiFetch } from '@/lib/api';
import {
  AdminBanner,
  Pagination,
  confirmAdminAction,
} from '@/components/admin/ui';

export default function AdminVerificationsPage() {
  const [companies, setCompanies] = useState<any[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>('PENDING');
  const [counts, setCounts] = useState<{
    PENDING: number;
    VERIFIED: number;
    REJECTED: number;
  }>({ PENDING: 0, VERIFIED: 0, REJECTED: 0 });
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [pageCount, setPageCount] = useState(1);
  const [loading, setLoading] = useState(true);
  const [rejectionReasons, setRejectionReasons] = useState<Record<string, string>>({});
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const loadCompanies = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('paginated', 'true');
      params.set('page', String(page));
      params.set('pageSize', String(pageSize));
      if (statusFilter !== 'ALL') {
        params.set('status', statusFilter);
      }
      const res = await apiFetch<any>(`/admin/verifications?${params.toString()}`);
      if (Array.isArray(res)) {
        setCompanies(res);
        setTotal(res.length);
        setPageCount(1);
      } else {
        setCompanies(res?.items || []);
        setTotal(res?.total ?? 0);
        setPageCount(res?.pageCount ?? 1);
        if (res?.counts) setCounts(res.counts);
      }
    } catch (err: any) {
      setError(err?.message || 'ไม่สามารถโหลดรายการคำขอยืนยันบริษัทได้');
      setCompanies([]);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, page, pageSize]);

  useEffect(() => {
    loadCompanies();
  }, [loadCompanies]);

  const handleDecision = async (
    c: any,
    status: 'VERIFIED' | 'REJECTED',
  ) => {
    setMessage('');
    setError('');

    const action = status === 'VERIFIED' ? 'APPROVE' : 'REJECT';
    const rawReason = (rejectionReasons[c.id] || '').trim();

    if (status === 'REJECTED') {
      if (rawReason.length < 10) {
        setError(
          'กรุณาระบุเหตุผลการปฏิเสธอย่างน้อย 10 ตัวอักษร ก่อนกดปฏิเสธคำขอยืนยันตัวตน',
        );
        return;
      }
    }

    const confirmed = confirmAdminAction(
      status === 'VERIFIED'
        ? `ยืนยันการอนุมัติสถานะนิติบุคคลของบริษัท "${c.companyName}" (เลขทะเบียน ${c.businessRegistrationNo}) หรือไม่?`
        : `ยืนยันการปฏิเสธคำขอยืนยันตัวตนของบริษัท "${c.companyName}" ด้วยเหตุผล: "${rawReason}" หรือไม่?`,
    );
    if (!confirmed) return;

    try {
      await apiFetch(`/admin/verifications/${c.id}/review`, {
        method: 'PUT',
        body: JSON.stringify({
          action,
          reason: status === 'REJECTED' ? rawReason : undefined,
        }),
      });
      setMessage(
        `อัปเดตสถานะการยืนยันบริษัท "${c.companyName}" เป็น ${status} เรียบร้อยแล้ว`,
      );
      await loadCompanies();
    } catch (err: any) {
      setError(err.message || 'ดำเนินการไม่สำเร็จ');
    }
  };

  const totalAll = counts.PENDING + counts.VERIFIED + counts.REJECTED;

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            ตรวจสอบและอนุมัติการยืนยันตัวตนบริษัท (Company Verification Review)
          </h1>
          <p className="text-sm text-slate-600">
            ตรวจสอบเลขทะเบียนนิติบุคคล 13 หลักและเปิดดูเอกสารแนบ ก่อนอนุมัติสิทธิ์ประกาศตำแหน่งงาน
          </p>
        </div>

        <div className="flex items-center gap-2">
          <select
            className="input text-xs w-48"
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            aria-label="กรองสถานะการยืนยัน"
          >
            <option value="PENDING">รอตรวจสอบ (PENDING: {counts.PENDING})</option>
            <option value="VERIFIED">อนุมัติแล้ว (VERIFIED: {counts.VERIFIED})</option>
            <option value="REJECTED">ปฏิเสธแล้ว (REJECTED: {counts.REJECTED})</option>
            <option value="ALL">ทั้งหมด (ALL: {totalAll})</option>
          </select>
        </div>
      </div>

      {/* Filter Tabs */}
      <div
        role="tablist"
        className="flex flex-wrap gap-2 border-b border-slate-200 pb-3"
      >
        {[
          { key: 'PENDING', label: `รอตรวจสอบ (${counts.PENDING})` },
          { key: 'VERIFIED', label: `อนุมัติแล้ว (${counts.VERIFIED})` },
          { key: 'REJECTED', label: `ปฏิเสธแล้ว (${counts.REJECTED})` },
          { key: 'ALL', label: `ทั้งหมด (${totalAll})` },
        ].map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={statusFilter === tab.key}
            onClick={() => {
              setStatusFilter(tab.key);
              setPage(1);
            }}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition ${
              statusFilter === tab.key
                ? 'bg-blue-600 text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <AdminBanner
        message={message}
        error={error}
        onClear={() => {
          setMessage('');
          setError('');
        }}
      />

      {loading ? (
        <div className="card p-8 text-center text-slate-500">
          กำลังโหลดคำขอยืนยันตัวตนบริษัท...
        </div>
      ) : companies.length === 0 ? (
        <div className="card p-8 text-center text-slate-500">
          ไม่มีรายการคำขอยืนยันบริษัทในสถานะ {statusFilter}
        </div>
      ) : (
        <div className="space-y-4">
          {companies.map((c) => {
            const files: any[] = Array.isArray(c.documents?.files)
              ? c.documents.files
              : [];
            const isPending = c.verificationStatus === 'PENDING';
            const reasonLen = (rejectionReasons[c.id] || '').trim().length;

            return (
              <div key={c.id} className="card space-y-4">
                <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
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
                      <h2 className="text-lg font-bold text-slate-900">
                        {c.companyName}
                      </h2>
                    </div>

                    <p className="text-xs text-slate-600">
                      เลขทะเบียนนิติบุคคล 13 หลัก:{' '}
                      <b className="font-mono">
                        {c.businessRegistrationNo || 'ยังไม่ระบุ'}
                      </b>{' '}
                      • อีเมล: {c.user?.email || c.company?.contactEmail || '-'}
                      {c.company?.contactPhone
                        ? ` • โทร: ${c.company.contactPhone}`
                        : ''}
                      {c.company?.website ? ` • เว็บไซต์: ${c.company.website}` : ''}
                    </p>

                    {/* Attached Verification Documents */}
                    <div className="pt-1 space-y-1">
                      <div className="text-xs font-semibold text-slate-700">
                        เอกสารรับรองนิติบุคคลที่แนบ ({files.length} ไฟล์):
                      </div>
                      {files.length === 0 ? (
                        <div className="text-xs text-amber-700">
                          ไม่พบไฟล์เอกสารแนบ
                        </div>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {files.map((f: any, idx: number) => {
                            const href = f.downloadUrl?.startsWith('/api/')
                              ? f.downloadUrl
                              : `/api${
                                  f.downloadUrl ||
                                  `/admin/verifications/${c.id}/documents/${
                                    f.index ?? idx
                                  }`
                                }`;
                            const kb = f.size
                              ? `${Math.max(1, Math.round(f.size / 1024))} KB`
                              : '';
                            return (
                              <a
                                key={idx}
                                href={href}
                                target="_blank"
                                rel="noopener noreferrer"
                                data-doc={idx}
                                className="px-3 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 text-xs font-medium inline-flex items-center gap-1.5 transition"
                              >
                                📄 เปิดดูเอกสาร: {f.name || `document-${idx + 1}`}
                                {kb ? ` (${kb})` : ''}
                              </a>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {!isPending && (
                      <div className="text-xs text-slate-500 pt-1">
                        ตรวจสอบเมื่อ:{' '}
                        {c.reviewedAt
                          ? new Date(c.reviewedAt).toLocaleString('th-TH')
                          : '-'}
                        {c.rejectionReason && (
                          <span className="text-red-700 block mt-0.5">
                            เหตุผลที่ปฏิเสธ: {c.rejectionReason}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {isPending && (
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 shrink-0">
                      <div className="space-y-1">
                        <input
                          type="text"
                          className="input text-xs w-72"
                          placeholder="ระบุเหตุผลกรณีไม่อนุมัติ (อย่างน้อย 10 ตัวอักษร)..."
                          value={rejectionReasons[c.id] || ''}
                          onChange={(e) =>
                            setRejectionReasons((prev) => ({
                              ...prev,
                              [c.id]: e.target.value,
                            }))
                          }
                        />
                        <div className="text-[11px] text-slate-400">
                          ความยาวเหตุผล: {reasonLen}/10 ตัวอักษรขั้นต่ำ (จำเป็นเมื่อกดปฏิเสธ)
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDecision(c, 'VERIFIED')}
                        className="btn-primary text-xs"
                      >
                        อนุมัติ (VERIFIED)
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDecision(c, 'REJECTED')}
                        className="btn-danger text-xs"
                      >
                        ปฏิเสธ (REJECTED)
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="card">
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
