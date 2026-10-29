'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Briefcase,
  Code2,
  GraduationCap,
  LayoutDashboard,
  LogOut,
  ShieldCheck,
  User,
  Globe,
  Building2,
} from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { useLanguage } from '@/lib/use-language';
import { NotificationBell } from './NotificationBell';

export function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();
  const { lang, setLang, t } = useLanguage();

  const handleLogout = async () => {
    await logout();
    router.push('/login');
  };

  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(href);

  const navLinkClass = (href: string) =>
    `px-3 py-2 rounded-lg text-sm font-medium transition flex items-center gap-1.5 ${
      isActive(href)
        ? 'text-[#2584FF] font-semibold bg-white/[0.06]'
        : 'text-zinc-400 hover:text-white hover:bg-white/[0.04]'
    }`;

  const displayName =
    user?.candidateProfile?.fullName || user?.company?.name || user?.email || '';

  const initials = displayName
    ? displayName
        .split(/\s+/)
        .map((part) => part[0])
        .join('')
        .slice(0, 2)
        .toUpperCase()
    : 'SC';

  return (
    <header
      className={`sticky top-0 z-40 bg-[#111317] text-white ${
        pathname === '/' ? 'border-b border-white/[0.06]' : 'border-b border-zinc-800 shadow-sm'
      }`}
    >
      <div className="max-w-[1360px] mx-auto px-4 sm:px-6 lg:px-10 h-16 flex items-center justify-between gap-4">
        <div className="flex items-center gap-7">
          <Link href="/" className="flex items-center gap-3 group">
            <svg
              className="w-10 h-6 text-[#1D7AFC] transition-transform group-hover:scale-105"
              viewBox="0 0 64 36"
              fill="none"
              stroke="currentColor"
              strokeWidth="7"
              strokeLinecap="round"
            >
              <path d="M18 8C11.3726 8 6 13.3726 6 20C6 26.6274 11.3726 32 18 32C26 32 38 8 46 8C52.6274 8 58 13.3726 58 20C58 26.6274 52.6274 32 46 32C38 32 26 8 18 8Z" />
            </svg>
            <span className="font-bold text-lg tracking-tight text-white">SmartCareer</span>
          </Link>

          <nav className="hidden md:flex items-center gap-1.5">
            <Link href="/" className={navLinkClass('/')}>
              {t('หน้าแรก', 'Home')}
            </Link>
            <Link href="/jobs" className={navLinkClass('/jobs')}>
              <Briefcase className="w-4 h-4" />
              {t('ค้นหางาน', 'Jobs')}
            </Link>
            <Link href="/assessments" className={navLinkClass('/assessments')}>
              <Code2 className="w-4 h-4" />
              {t('ประเมินทักษะ', 'Assessments')}
            </Link>
            <Link href="/courses" className={navLinkClass('/courses')}>
              <GraduationCap className="w-4 h-4" />
              {t('คอร์สเรียน', 'Courses')}
            </Link>

            {user?.role === 'CANDIDATE' && (
              <>
                <Link href="/profile" className={navLinkClass('/profile')}>
                  <User className="w-4 h-4" />
                  {t('โปรไฟล์ & ทักษะ', 'Profile')}
                </Link>
                <Link href="/applications" className={navLinkClass('/applications')}>
                  {t('ใบสมัครของฉัน', 'My Applications')}
                </Link>
                <Link href="/learning-plan" className={navLinkClass('/learning-plan')}>
                  {t('แผนพัฒนาทักษะ', 'Learning Plan')}
                </Link>
              </>
            )}

            {user?.role === 'COMPANY' && (
              <>
                <Link href="/company/dashboard" className={navLinkClass('/company/dashboard')}>
                  <LayoutDashboard className="w-4 h-4" />
                  {t('แดชบอร์ดบริษัท', 'Company')}
                </Link>
                <Link href="/company/jobs" className={navLinkClass('/company/jobs')}>
                  {t('จัดการงาน', 'Manage Jobs')}
                </Link>
                <Link
                  href="/company/applications"
                  className={navLinkClass('/company/applications')}
                >
                  {t('คัดเลือกผู้สมัคร', 'Applicants')}
                </Link>
                <Link
                  href="/company/assessments"
                  className={navLinkClass('/company/assessments')}
                >
                  {t('ข้อสอบบริษัท', 'Company Exams')}
                </Link>
                <Link href="/company/profile" className={navLinkClass('/company/profile')}>
                  <Building2 className="w-4 h-4" />
                  {t('ข้อมูลบริษัท', 'Profile & Verify')}
                </Link>
              </>
            )}

            {user?.role === 'ADMIN' && (
              <>
                <Link href="/admin/dashboard" className={navLinkClass('/admin/dashboard')}>
                  <ShieldCheck className="w-4 h-4" />
                  {t('ผู้ดูแลระบบ', 'Admin')}
                </Link>
                <Link href="/admin/users" className={navLinkClass('/admin/users')}>
                  {t('ผู้ใช้', 'Users')}
                </Link>
                <Link
                  href="/admin/verifications"
                  className={navLinkClass('/admin/verifications')}
                >
                  {t('ตรวจบริษัท', 'Verifications')}
                </Link>
                <Link href="/admin/skills" className={navLinkClass('/admin/skills')}>
                  {t('ทักษะกลาง', 'Skills')}
                </Link>
                <Link href="/admin/assessments" className={navLinkClass('/admin/assessments')}>
                  {t('ข้อสอบกลาง', 'Platform Exams')}
                </Link>
                <Link href="/admin/ingestion" className={navLinkClass('/admin/ingestion')}>
                  {t('นำเข้าข้อมูล', 'Ingestion')}
                </Link>
              </>
            )}
          </nav>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setLang(lang === 'th' ? 'en' : 'th')}
            className="px-3 py-1.5 rounded-full bg-zinc-800/90 border border-zinc-700 text-xs font-semibold text-zinc-200 hover:bg-zinc-700 flex items-center gap-1.5 transition"
          >
            <Globe className="w-3.5 h-3.5 text-[#2584FF]" />
            {lang === 'th' ? 'TH' : 'EN'}
          </button>

          {user ? (
            <>
              <NotificationBell />
              <div className="hidden sm:flex items-center gap-2.5 pl-1">
                <div className="flex flex-col items-end text-xs">
                  <span className="font-semibold text-zinc-100">{displayName}</span>
                  <span className="text-[10px] text-[#2584FF] font-semibold tracking-wide">
                    {user.role}
                  </span>
                </div>
                <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-blue-500 to-indigo-500 text-white font-bold text-xs flex items-center justify-center ring-2 ring-zinc-700 shrink-0">
                  {initials}
                </div>
              </div>
              <button
                type="button"
                onClick={handleLogout}
                className="p-2 rounded-full text-zinc-400 hover:text-rose-400 hover:bg-zinc-800 transition"
                title={t('ออกจากระบบ', 'Sign out')}
              >
                <LogOut className="w-4 h-4" />
              </button>
            </>
          ) : (
            <div className="flex items-center gap-2">
              <Link
                href="/login"
                className="px-3.5 py-2 rounded-full text-sm font-medium text-zinc-300 hover:text-white hover:bg-zinc-800 transition"
              >
                {t('เข้าสู่ระบบ', 'Sign In')}
              </Link>
              <Link
                href="/register"
                className="px-4 py-2 rounded-full text-sm font-semibold bg-[#1D7AFC] text-white hover:bg-blue-600 transition shadow-sm"
              >
                {t('เริ่มต้นใช้งาน', 'Get Started')}
              </Link>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

export function MainContainer({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (pathname === '/') {
    return <main className="flex-1 w-full bg-[#F2F4F8]">{children}</main>;
  }
  return (
    <main className="flex-1 max-w-[1360px] w-full mx-auto px-4 sm:px-6 lg:px-10 py-8">
      {children}
    </main>
  );
}

export function Footer() {
  const { t } = useLanguage();
  return (
    <footer className="bg-white border-t border-slate-200/80 mt-auto">
      <div className="max-w-[1360px] mx-auto px-4 sm:px-6 lg:px-10 py-7 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500">
        <div>
          <span className="font-bold text-slate-900">SmartCareer</span> —{' '}
          {t(
            'แพลตฟอร์มจับคู่งานด้วยผลสอบปฏิบัติและวางแผนพัฒนาทักษะ',
            'Evidence-based skill assessment, job matching & career development platform',
          )}
        </div>
        <div className="flex gap-5 font-medium">
          <Link href="/jobs" className="hover:text-[#1D7AFC] transition">
            {t('ค้นหางาน', 'Jobs')}
          </Link>
          <Link href="/assessments" className="hover:text-[#1D7AFC] transition">
            {t('ข้อสอบ', 'Assessments')}
          </Link>
          <Link href="/courses" className="hover:text-[#1D7AFC] transition">
            {t('คอร์สเรียน', 'Courses')}
          </Link>
        </div>
      </div>
    </footer>
  );
}
