'use client';

import React, { useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Activity,
  Award,
  ClipboardCheck,
  Database,
  FileSearch,
  LayoutDashboard,
  ShieldAlert,
  Sparkles,
  Users,
} from 'lucide-react';
import { useAuth } from '@/lib/auth-context';

const ADMIN_NAV_ITEMS = [
  { href: '/admin/dashboard', label: 'ศูนย์ควบคุม (Dashboard)', icon: LayoutDashboard },
  { href: '/admin/users', label: 'จัดการผู้ใช้งาน (Users)', icon: Users },
  { href: '/admin/verifications', label: 'ตรวจบริษัทยืนยันตัวตน', icon: ClipboardCheck },
  { href: '/admin/skills', label: 'ทักษะกลาง (Skills)', icon: Sparkles },
  { href: '/admin/assessments', label: 'ข้อสอบกลาง (Exams)', icon: Award },
  { href: '/admin/ingestion', label: 'นำเข้าข้อมูล (Ingestion)', icon: Database },
  { href: '/admin/data', label: 'ข้อมูลระบบ (Data Browser)', icon: FileSearch },
  { href: '/admin/audit-logs', label: 'Audit Logs', icon: Activity },
];

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

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-xl p-2 shadow-xs overflow-x-auto">
        <div className="flex items-center gap-1.5 min-w-max">
          {ADMIN_NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active =
              pathname === item.href ||
              (item.href !== '/admin/dashboard' && pathname?.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`px-3 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition ${
                  active
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>
      </div>
      {children}
    </div>
  );
}
