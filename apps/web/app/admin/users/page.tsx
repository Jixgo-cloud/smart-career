'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { apiFetch } from '@/lib/api';
import {
  AdminBanner,
  Pagination,
  confirmAdminAction,
  useDebounce,
} from '@/components/admin/ui';

export default function AdminUsersPage() {
  const [users, setUsers] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);
  const [roleFilter, setRoleFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [pageCount, setPageCount] = useState(1);
  const [counts, setCounts] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      params.set('paginated', 'true');
      params.set('page', String(page));
      params.set('pageSize', String(pageSize));
      if (debouncedSearch.trim()) params.set('search', debouncedSearch.trim());
      if (roleFilter !== 'ALL') params.set('role', roleFilter);
      if (statusFilter !== 'ALL') params.set('status', statusFilter);

      const res = await apiFetch<any>(`/admin/users?${params.toString()}`);
      if (Array.isArray(res)) {
        setUsers(res);
        setTotal(res.length);
        setPageCount(1);
      } else {
        setUsers(res?.items || []);
        setTotal(res?.total ?? 0);
        setPageCount(res?.pageCount ?? 1);
        setCounts(res?.counts || null);
      }
    } catch (err: any) {
      setError(err?.message || 'ไม่สามารถโหลดรายชื่อผู้ใช้งานได้');
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, roleFilter, statusFilter, page, pageSize]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const handleToggleActive = async (u: any) => {
    const nextActive = !u.isActive;
    const confirmed = confirmAdminAction(
      nextActive
        ? `ยืนยันการปลดระงับบัญชี "${u.email}" หรือไม่?`
        : `ยืนยันการระงับบัญชี "${u.email}" ทันทีหรือไม่? (เซสชันทั้งหมดจะถูกเพิกถอนทันที)`,
    );
    if (!confirmed) return;

    setMessage('');
    setError('');
    try {
      await apiFetch(`/admin/users/${u.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: nextActive }),
      });
      setMessage(
        nextActive
          ? `ปลดระงับบัญชี ${u.email} เรียบร้อยแล้ว`
          : `ระงับบัญชี ${u.email} และเพิกถอนเซสชันเรียบร้อยแล้ว`,
      );
      await loadUsers();
    } catch (err: any) {
      setError(err?.message || 'ไม่สามารถเปลี่ยนสถานะผู้ใช้ได้');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">จัดการบัญชีผู้ใช้งาน</h1>
          <p className="text-sm text-slate-600">
            ตรวจสอบสถานะบัญชี กรองตามบทบาท และระงับการใช้งาน (Revoke sessions ทันทีเมื่อระงับบัญชี)
          </p>
          {counts && (
            <div className="text-xs text-slate-500 mt-1">
              ทั้งหมด {counts.ALL} บัญชี • ผู้สมัคร {counts.CANDIDATE} • บริษัท{' '}
              {counts.COMPANY} • แอดมิน {counts.ADMIN} • ปกติ {counts.ACTIVE} • ถูกระงับ{' '}
              {counts.INACTIVE}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            className="input w-64"
            placeholder="ค้นหาชื่อ หรืออีเมล..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
          <select
            className="input w-40 text-xs"
            value={roleFilter}
            onChange={(e) => {
              setRoleFilter(e.target.value);
              setPage(1);
            }}
            aria-label="กรองตามบทบาท"
          >
            <option value="ALL">ทุกบทบาท (All Roles)</option>
            <option value="CANDIDATE">CANDIDATE</option>
            <option value="COMPANY">COMPANY</option>
            <option value="ADMIN">ADMIN</option>
          </select>
          <select
            className="input w-40 text-xs"
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            aria-label="กรองตามสถานะ"
          >
            <option value="ALL">ทุกสถานะ (All Status)</option>
            <option value="ACTIVE">ปกติ (Active)</option>
            <option value="INACTIVE">ระงับการใช้งาน</option>
          </select>
        </div>
      </div>

      <AdminBanner
        message={message}
        error={error}
        onClear={() => {
          setMessage('');
          setError('');
        }}
      />

      <div className="card overflow-x-auto space-y-4">
        {loading ? (
          <div className="p-8 text-center text-slate-500">กำลังโหลดรายชื่อผู้ใช้...</div>
        ) : users.length === 0 ? (
          <div className="p-8 text-center text-slate-500">ไม่พบบัญชีผู้ใช้งานที่ตรงตามเงื่อนไข</div>
        ) : (
          <table className="w-full text-sm text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 text-slate-600">
                <th className="py-2.5 px-3">อีเมล</th>
                <th className="py-2.5 px-3">ชื่อ / องค์กร</th>
                <th className="py-2.5 px-3">บทบาท (Role)</th>
                <th className="py-2.5 px-3">ช่องทาง</th>
                <th className="py-2.5 px-3">สถานะ</th>
                <th className="py-2.5 px-3">วันที่สร้าง</th>
                <th className="py-2.5 px-3">จัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-slate-50">
                  <td className="py-2.5 px-3 font-medium text-slate-900">{u.email}</td>
                  <td className="py-2.5 px-3">
                    <div>{u.name || '-'}</div>
                    {u.company && (
                      <div className="text-[11px] text-slate-500">
                        บริษัท: {u.company.name} ({u.company.verificationStatus})
                      </div>
                    )}
                    {u.candidateProfile?.githubUsername && (
                      <div className="text-[11px] text-slate-500">
                        GitHub: @{u.candidateProfile.githubUsername}
                      </div>
                    )}
                  </td>
                  <td className="py-2.5 px-3">
                    <span className="badge bg-blue-50 text-blue-700">{u.role}</span>
                  </td>
                  <td className="py-2.5 px-3 text-xs text-slate-600">
                    {u.authProvider || 'LOCAL'}
                  </td>
                  <td className="py-2.5 px-3">
                    {u.isActive ? (
                      <span className="badge bg-emerald-100 text-emerald-800">
                        ปกติ (Active)
                      </span>
                    ) : (
                      <span className="badge bg-red-100 text-red-700">
                        ระงับการใช้งาน
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 px-3 text-xs text-slate-500">
                    {u.createdAt ? new Date(u.createdAt).toLocaleDateString('th-TH') : '-'}
                  </td>
                  <td className="py-2.5 px-3">
                    {u.role !== 'ADMIN' && (
                      <button
                        type="button"
                        onClick={() => handleToggleActive(u)}
                        className={
                          u.isActive ? 'btn-danger text-xs' : 'btn-secondary text-xs'
                        }
                      >
                        {u.isActive ? 'ระงับบัญชี' : 'ปลดระงับ'}
                      </button>
                    )}
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
