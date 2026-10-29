'use client';

import React, { useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ShieldAlert } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';

type Role = 'CANDIDATE' | 'COMPANY' | 'ADMIN';

const ROLE_LABEL: Record<Role, string> = {
  CANDIDATE: 'ผู้สมัครงาน',
  COMPANY: 'บริษัท',
  ADMIN: 'ผู้ดูแลระบบ',
};

/**
 * Client-side route guard by role. Guests are redirected to /login; signed-in users of another role
 * see a full-page 403 (same pattern as the admin layout) instead of the page shell with API errors.
 * API endpoints remain the authoritative enforcement.
 */
export default function RoleGuard({ role, children }: { role: Role; children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!loading && !user) {
      router.replace(`/login?next=${encodeURIComponent(pathname || '/')}`);
    }
  }, [loading, user, pathname, router]);

  if (loading) {
    return <div className="card p-10 text-center text-slate-500">กำลังตรวจสอบสิทธิ์...</div>;
  }

  if (!user) {
    return (
      <div className="card max-w-xl mx-auto p-8 text-center space-y-4">
        <ShieldAlert className="w-10 h-10 text-amber-500 mx-auto" />
        <h1 className="text-xl font-bold text-slate-900">
          401 Unauthorized — กรุณาเข้าสู่ระบบ ({ROLE_LABEL[role]})
        </h1>
        <Link
          href={`/login?next=${encodeURIComponent(pathname || '/')}`}
          className="btn-primary inline-block text-xs"
        >
          ไปหน้าเข้าสู่ระบบ →
        </Link>
      </div>
    );
  }

  if (user.role !== role) {
    return (
      <div className="card max-w-xl mx-auto p-8 text-center space-y-4">
        <ShieldAlert className="w-10 h-10 text-red-500 mx-auto" />
        <h1 className="text-xl font-bold text-slate-900">
          403 Forbidden — ไม่มีสิทธิ์เข้าถึงหน้าสำหรับ{ROLE_LABEL[role]}
        </h1>
        <p className="text-sm text-slate-600">
          Insufficient role permissions for this resource. บัญชีของคุณ ({user.role}) ไม่มีสิทธิ์เข้าใช้งานส่วนนี้
        </p>
        <div>
          <Link href="/" className="btn-secondary inline-block text-xs">
            กลับหน้าหลัก
          </Link>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
