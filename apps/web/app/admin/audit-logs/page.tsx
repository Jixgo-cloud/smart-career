'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { AdminBanner, Pagination, useDebounce } from '@/components/admin/ui';

export default function AdminAuditLogsPage() {
  const [items, setItems] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);
  const [targetType, setTargetType] = useState('ALL');
  const [page, setPage] = useState(1);
  const [pageSize] = useState(25);
  const [total, setTotal] = useState(0);
  const [pageCount, setPageCount] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadLogs = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('pageSize', String(pageSize));
      if (debouncedSearch.trim()) params.set('search', debouncedSearch.trim());
      if (targetType !== 'ALL') params.set('targetType', targetType);

      const res = await apiFetch<any>(`/admin/audit-logs?${params.toString()}`);
      setItems(res?.items || []);
      setTotal(res?.total ?? 0);
      setPageCount(res?.pageCount ?? 1);
    } catch (err: any) {
      setError(err?.message || 'ไม่สามารถโหลดบันทึก Audit Logs ได้');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, targetType, page, pageSize]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            บันทึกการกระทำของผู้ดูแลระบบ (Admin Audit Trail)
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          <input
            type="text"
            className="input w-full sm:w-64 text-xs"
            placeholder="ค้นหา Action, Target ID หรืออีเมลแอดมิน..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
          <select
            className="input w-full sm:w-44 text-xs"
            value={targetType}
            onChange={(e) => {
              setTargetType(e.target.value);
              setPage(1);
            }}
          >
            <option value="ALL">ทุกประเภท (All Targets)</option>
            <option value="USER">USER</option>
            <option value="VERIFICATION">VERIFICATION</option>
            <option value="SKILL">SKILL</option>
            <option value="ASSESSMENT">ASSESSMENT</option>
            <option value="INGESTION">INGESTION</option>
            <option value="JOB">JOB</option>
            <option value="COURSE">COURSE</option>
          </select>
        </div>
      </div>

      <AdminBanner error={error} onClear={() => setError('')} />

      <div className="card overflow-x-auto space-y-4">
        {loading ? (
          <div className="p-8 text-center text-slate-500">
            กำลังโหลดบันทึก Audit Logs...
          </div>
        ) : items.length === 0 ? (
          <div className="p-8 text-center text-slate-500">
            ไม่พบบันทึกการกระทำในระบบ
          </div>
        ) : (
          <table className="w-full min-w-[680px] text-xs text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 text-slate-600">
                <th className="py-2.5 px-3">เวลา</th>
                <th className="py-2.5 px-3">ผู้ดำเนินการ (Actor)</th>
                <th className="py-2.5 px-3">การกระทำ (Action)</th>
                <th className="py-2.5 px-3">ประเภท / Target ID</th>
                <th className="py-2.5 px-3">รายละเอียด (Metadata)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((log) => (
                <tr key={log.id} className="hover:bg-slate-50">
                  <td className="py-2.5 px-3 text-slate-500 whitespace-nowrap">
                    {new Date(log.createdAt).toLocaleString('th-TH')}
                  </td>
                  <td className="py-2.5 px-3 font-medium text-slate-900">
                    {log.actor?.email || log.actorId}
                  </td>
                  <td className="py-2.5 px-3">
                    <span className="badge bg-indigo-50 text-indigo-700 font-mono">
                      {log.action}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 font-mono text-slate-600">
                    <b>{log.targetType}</b>
                    {log.targetId ? ` • ${log.targetId}` : ''}
                  </td>
                  <td className="py-2.5 px-3 font-mono text-slate-600 max-w-md truncate">
                    {log.metadata ? JSON.stringify(log.metadata) : '-'}
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
