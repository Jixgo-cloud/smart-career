'use client';

import React, { useEffect, useState } from 'react';

export function useDebounce<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}

export function confirmAdminAction(message: string): boolean {
  if (typeof window === 'undefined') return true;
  return window.confirm(message);
}

export function AdminBanner({
  message,
  error,
  onClear,
}: {
  message?: string;
  error?: string;
  onClear?: () => void;
}) {
  if (!message && !error) return null;
  return (
    <div className="space-y-2">
      {message && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm flex items-center justify-between gap-2">
          <span>{message}</span>
          {onClear && (
            <button
              type="button"
              onClick={onClear}
              className="text-xs text-emerald-700 hover:underline"
            >
              ปิด
            </button>
          )}
        </div>
      )}
      {error && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm flex items-center justify-between gap-2">
          <span>{error}</span>
          {onClear && (
            <button
              type="button"
              onClick={onClear}
              className="text-xs text-red-700 hover:underline"
            >
              ปิด
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function Pagination({
  page,
  pageCount,
  total,
  pageSize,
  onPageChange,
}: {
  page: number;
  pageCount: number;
  total: number;
  pageSize: number;
  onPageChange: (nextPage: number) => void;
}) {
  if (pageCount <= 1 && total <= pageSize) return null;
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(total, page * pageSize);

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-slate-100 text-xs text-slate-600">
      <div>
        แสดง {start}–{end} จากทั้งหมด <b>{total}</b> รายการ (หน้า {page}/{pageCount})
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          className="btn-secondary text-xs disabled:opacity-50"
        >
          ← ก่อนหน้า
        </button>
        <button
          type="button"
          disabled={page >= pageCount}
          onClick={() => onPageChange(page + 1)}
          className="btn-secondary text-xs disabled:opacity-50"
        >
          ถัดไป →
        </button>
      </div>
    </div>
  );
}
