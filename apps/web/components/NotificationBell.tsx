'use client';

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { Bell, CheckCheck } from 'lucide-react';
import { apiRequest } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useLanguage } from '@/lib/use-language';

export function NotificationBell() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [items, setItems] = useState<any[]>([]);

  const fetchNotifications = useCallback(async () => {
    if (!user) return;
    try {
      const [countRes, listRes] = await Promise.all([
        apiRequest<{ unreadCount: number }>('/notifications/unread-count'),
        apiRequest<any[]>('/notifications?limit=15'),
      ]);
      setUnreadCount(countRes?.unreadCount ?? 0);
      setItems(Array.isArray(listRes) ? listRes : []);
    } catch {
      // Ignore polling error
    }
  }, [user]);

  useEffect(() => {
    if (!user) return;
    fetchNotifications();
    const timer = setInterval(fetchNotifications, 15000);
    return () => clearInterval(timer);
  }, [user, fetchNotifications]);

  if (!user) return null;

  const handleMarkRead = async (id: string) => {
    try {
      await apiRequest(`/notifications/${id}/read`, { method: 'PATCH' });
      fetchNotifications();
    } catch {
      // ignore
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await apiRequest('/notifications/read-all', { method: 'PATCH' });
      fetchNotifications();
    } catch {
      // ignore
    }
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="relative w-9 h-9 rounded-full bg-zinc-800/90 border border-zinc-700/80 flex items-center justify-center text-zinc-300 hover:text-white hover:bg-zinc-700/80 transition focus:outline-none focus:ring-2 focus:ring-[#1D7AFC]"
        aria-label={t('การแจ้งเตือน', 'Notifications')}
      >
        <Bell className="w-4 h-4" />
        {unreadCount > 0 ? (
          <span className="absolute -top-1 -right-1 bg-[#1D7AFC] text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        ) : (
          <span className="w-2 h-2 rounded-full bg-[#2584FF] absolute top-2 right-2.5" />
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white rounded-xl shadow-lg border border-slate-200 z-50 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
            <span className="font-semibold text-sm text-slate-800">
              {t('การแจ้งเตือน', 'Notifications')}
            </span>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={handleMarkAllRead}
                className="text-xs text-indigo-600 hover:text-indigo-700 flex items-center gap-1 font-medium"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                {t('อ่านทั้งหมด', 'Mark all read')}
              </button>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto divide-y divide-slate-100">
            {items.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-500">
                {t('ยังไม่มีการแจ้งเตือน', 'No notifications yet')}
              </div>
            ) : (
              items.map((n) => (
                <div
                  key={n.id}
                  className={`p-3.5 text-xs transition ${
                    n.isRead ? 'bg-white' : 'bg-indigo-50/60'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="font-semibold text-slate-800">{n.title}</div>
                    {!n.isRead && (
                      <button
                        type="button"
                        onClick={() => handleMarkRead(n.id)}
                        className="text-[11px] text-indigo-600 hover:underline shrink-0"
                      >
                        {t('อ่านแล้ว', 'Mark read')}
                      </button>
                    )}
                  </div>
                  <p className="text-slate-600 mt-1">{n.message}</p>
                  {n.link && (
                    <Link
                      href={n.link}
                      onClick={() => {
                        if (!n.isRead) handleMarkRead(n.id);
                        setOpen(false);
                      }}
                      className="inline-block mt-1.5 text-indigo-600 font-medium hover:underline"
                    >
                      {t('เปิดดูรายละเอียด →', 'View details →')}
                    </Link>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
