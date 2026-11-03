'use client';

import React, { useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ShieldAlert } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!loading && !user) {
      const next = encodeURIComponent(pathname || '/admin/dashboard');
      router.replace(`/login?next=${next}`);
    }
  }, [loading, user, pathname, router]);

  if (loading) {
    return (
      <div className="card p-10 text-center text-slate-500">
        กำลังตรวจสอบสิทธิ์ผู้ดูแลระบบ...
      </div>
    );
  }

  if (!user) {
    return (
      <div className="card max-w-xl mx-auto p-8 text-center space-y-4">
        <ShieldAlert className="w-10 h-10 text-amber-500 mx-auto" />
        <h1 className="text-xl font-bold text-slate-900">
          401 Unauthorized — กรุณาเข้าสู่ระบบผู้ดูแลระบบ
        </h1>
        <p className="text-sm text-slate-600">
          คุณต้องเข้าสู่ระบบด้วยบัญชีผู้ดูแลระบบ (ADMIN) ก่อนเข้าใช้งานหน้านี้
        </p>
        <div>
          <Link
            href={`/login?next=${encodeURIComponent(pathname || '/admin/dashboard')}`}
            className="btn-primary inline-block text-xs"
          >
            ไปหน้าเข้าสู่ระบบ →
          </Link>
        </div>
      </div>
    );
  }

  if (user.role !== 'ADMIN') {
    return (
      <div className="card max-w-xl mx-auto p-8 text-center space-y-4">
        <ShieldAlert className="w-10 h-10 text-red-500 mx-auto" />
        <h1 className="text-xl font-bold text-slate-900">
          403 Forbidden — ไม่มีสิทธิ์เข้าถึงหน้าผู้ดูแลระบบ
        </h1>
        <p className="text-sm text-slate-600">
          Insufficient role permissions for this resource. บัญชีของคุณ ({user.role}) ไม่มีสิทธิ์เข้าใช้งานส่วนผู้ดูแลระบบ
        </p>
        <div>
          <Link href="/" className="btn-secondary inline-block text-xs">
            กลับหน้าหลัก
          </Link>
        </div>
      </div>
    );
  }

  return <div className="space-y-6">{children}</div>;
}
