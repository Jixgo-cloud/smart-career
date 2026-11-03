'use client';

import React, { useState, useEffect, useRef } from 'react';
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
  ChevronDown,
  Menu,
  X,
  Home,
} from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { useLanguage } from '@/lib/use-language';
import { NotificationBell } from './NotificationBell';

interface RoleNavItem {
  href: string;
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
}

export function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();
  const { lang, setLang, t } = useLanguage();

  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const openDropdown = () => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    setDropdownOpen(true);
  };

  const scheduleCloseDropdown = () => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
    }
    closeTimerRef.current = setTimeout(() => {
      setDropdownOpen(false);
    }, 150);
  };

  useEffect(() => {
    setDropdownOpen(false);
    setMobileMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    };
  }, []);

  const handleLogout = async () => {
    await logout();
    router.push('/login');
  };

  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(href);

  // Minimal button style with smooth Hover Scale-Up
  const mainNavLinkClass = (href: string) => {
    const active = isActive(href);
    return `px-3 py-1.5 rounded-lg text-sm flex items-center gap-1.5 whitespace-nowrap transition-all duration-200 ease-out hover:scale-105 ${
      active
        ? 'text-white font-semibold bg-white/[0.08]'
        : 'text-zinc-400 font-medium hover:text-white hover:bg-white/[0.04]'
    }`;
  };

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

  const roleMenuItems: RoleNavItem[] =
    user?.role === 'CANDIDATE'
      ? [
          { href: '/profile', label: t('โปรไฟล์ & ทักษะ', 'Profile'), icon: User },
          { href: '/applications', label: t('ใบสมัครของฉัน', 'My Applications') },
          { href: '/learning-plan', label: t('แผนพัฒนาทักษะ', 'Learning Plan') },
        ]
      : user?.role === 'COMPANY'
        ? [
            {
              href: '/company/dashboard',
              label: t('แดชบอร์ดบริษัท', 'Company'),
              icon: LayoutDashboard,
            },
            { href: '/company/jobs', label: t('จัดการงาน', 'Manage Jobs') },
            { href: '/company/applications', label: t('คัดเลือกผู้สมัคร', 'Applicants') },
            { href: '/company/assessments', label: t('ข้อสอบบริษัท', 'Company Exams') },
            {
              href: '/company/profile',
              label: t('ข้อมูลบริษัท', 'Profile & Verify'),
              icon: Building2,
            },
          ]
        : user?.role === 'ADMIN'
          ? [
              {
                href: '/admin/dashboard',
                label: t('ผู้ดูแลระบบ', 'Admin'),
                icon: ShieldCheck,
              },
              { href: '/admin/users', label: t('ผู้ใช้', 'Users') },
              { href: '/admin/verifications', label: t('ตรวจบริษัท', 'Verifications') },
              { href: '/admin/skills', label: t('ทักษะกลาง', 'Skills') },
              { href: '/admin/assessments', label: t('ข้อสอบกลาง', 'Platform Exams') },
              { href: '/admin/ingestion', label: t('นำเข้าข้อมูล', 'Ingestion') },
              { href: '/admin/data', label: t('ข้อมูลระบบ', 'Data Browser') },
              { href: '/admin/audit-logs', label: t('Audit Logs', 'Audit Logs') },
            ]
          : [];

  const activeRoleItem = roleMenuItems.find((item) => isActive(item.href));
  const triggerItem = activeRoleItem || roleMenuItems[0];
  const TriggerIcon =
    triggerItem?.icon ||
    (user?.role === 'COMPANY'
      ? LayoutDashboard
      : user?.role === 'ADMIN'
        ? ShieldCheck
        : User);

  return (
    <header
      className={`sticky top-0 z-40 bg-[#111317] text-white ${
        pathname === '/' ? 'border-b border-white/[0.06]' : 'border-b border-zinc-800'
      }`}
    >
      <div className="max-w-[1360px] mx-auto px-4 sm:px-6 lg:px-10 h-16 flex items-center justify-between gap-4">
        {/* Left: Brand + Minimal Main Nav with Hover Scale */}
        <div className="flex items-center gap-7 min-w-0">
          <Link href="/" className="flex items-center gap-2.5 group shrink-0">
            <img
              src="/logo.svg"
              alt="SmartCareer"
              className="w-9 h-9 transition-transform duration-200 group-hover:scale-105"
            />
            <span className="font-bold text-lg tracking-tight text-white">SmartCareer</span>
          </Link>

          <nav className="hidden lg:flex items-center gap-1">
            <Link href="/" className={mainNavLinkClass('/')}>
              {t('หน้าแรก', 'Home')}
            </Link>
            <Link href="/jobs" className={mainNavLinkClass('/jobs')}>
              <Briefcase className="w-4 h-4" />
              {t('ค้นหางาน', 'Jobs')}
            </Link>
            <Link href="/assessments" className={mainNavLinkClass('/assessments')}>
              <Code2 className="w-4 h-4" />
              {t('ประเมินทักษะ', 'Assessments')}
            </Link>
            <Link href="/courses" className={mainNavLinkClass('/courses')}>
              <GraduationCap className="w-4 h-4" />
              {t('คอร์สเรียน', 'Courses')}
            </Link>
          </nav>
        </div>

        {/* Right: Minimal Auto-Sliding Dropdown + Lang + NotificationBell + User + Mobile Toggle */}
        <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
          {roleMenuItems.length > 0 && triggerItem && (
            <div
              className="relative hidden lg:block"
              ref={dropdownRef}
              onMouseEnter={openDropdown}
              onMouseLeave={scheduleCloseDropdown}
            >
              <button
                type="button"
                onClick={() => setDropdownOpen((prev) => !prev)}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-medium flex items-center gap-2 whitespace-nowrap transition-all duration-200 border ${
                  activeRoleItem || dropdownOpen
                    ? 'bg-white/[0.1] text-white border-white/15'
                    : 'bg-zinc-800/70 text-zinc-300 border-zinc-700/80 hover:text-white hover:bg-zinc-800'
                }`}
                aria-expanded={dropdownOpen}
              >
                <TriggerIcon className="w-3.5 h-3.5 text-[#2584FF]" />
                <span>{triggerItem.label}</span>
                <ChevronDown
                  className={`w-3.5 h-3.5 text-zinc-400 transition-transform duration-200 ${
                    dropdownOpen ? 'rotate-180 text-white' : ''
                  }`}
                />
              </button>

              {/* Minimal Auto-Sliding Dropdown Panel */}
              <div
                className={`absolute right-0 top-full pt-2 w-48 origin-top-right z-50 transition-all duration-200 ease-out ${
                  dropdownOpen
                    ? 'opacity-100 translate-y-0 pointer-events-auto'
                    : 'opacity-0 -translate-y-2 pointer-events-none'
                }`}
              >
                <div className="rounded-xl bg-[#181B20] border border-zinc-800 shadow-xl p-1.5 space-y-0.5">
                  {roleMenuItems.map((item) => {
                    const active = isActive(item.href);
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setDropdownOpen(false)}
                        className={`flex items-center justify-between px-3 py-2 rounded-lg text-xs transition-all duration-150 whitespace-nowrap ${
                          active
                            ? 'bg-white/[0.08] text-white font-semibold'
                            : 'text-zinc-400 hover:bg-white/[0.04] hover:text-white hover:translate-x-1 font-medium'
                        }`}
                      >
                        <span>{item.label}</span>
                        {active && <span className="w-1.5 h-1.5 rounded-full bg-[#2584FF]" />}
                      </Link>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={() => setLang(lang === 'th' ? 'en' : 'th')}
            className="px-2.5 sm:px-3 py-1.5 rounded-lg bg-zinc-800/70 border border-zinc-700/80 text-xs font-medium text-zinc-300 hover:text-white hover:bg-zinc-800 flex items-center gap-1.5 transition whitespace-nowrap"
          >
            <Globe className="w-3.5 h-3.5 text-[#2584FF]" />
            {lang === 'th' ? 'TH' : 'EN'}
          </button>

          {user ? (
            <>
              <NotificationBell />
              <div className="hidden lg:flex items-center gap-2.5 pl-1">
                <div className="flex flex-col items-end text-xs leading-tight max-w-[140px]">
                  <span className="font-semibold text-zinc-100 truncate w-full text-right">
                    {displayName}
                  </span>
                  <span className="text-[10px] text-[#2584FF] font-medium">{user.role}</span>
                </div>
                <div className="w-8 h-8 rounded-full bg-zinc-800 border border-zinc-700 text-zinc-100 font-bold text-xs flex items-center justify-center shrink-0">
                  {initials}
                </div>
              </div>
              <button
                type="button"
                onClick={handleLogout}
                className="hidden lg:inline-flex p-2 rounded-lg text-zinc-400 hover:text-rose-400 hover:bg-white/[0.05] transition"
                title={t('ออกจากระบบ', 'Sign out')}
              >
                <LogOut className="w-4 h-4" />
              </button>
            </>
          ) : (
            <div className="hidden lg:flex items-center gap-2">
              <Link
                href="/login"
                className="px-3.5 py-2 rounded-lg text-sm font-medium text-zinc-300 hover:text-white hover:bg-white/[0.05] transition whitespace-nowrap"
              >
                {t('เข้าสู่ระบบ', 'Sign In')}
              </Link>
              <Link
                href="/register"
                className="px-4 py-2 rounded-lg text-sm font-semibold bg-[#1D7AFC] text-white hover:bg-blue-600 transition whitespace-nowrap"
              >
                {t('เริ่มต้นใช้งาน', 'Get Started')}
              </Link>
            </div>
          )}

          {/* Mobile & Tablet Hamburger Menu Button (< 1024px) */}
          <button
            type="button"
            onClick={() => setMobileMenuOpen((prev) => !prev)}
            className="lg:hidden w-10 h-10 rounded-xl bg-zinc-800/80 border border-zinc-700/80 flex items-center justify-center text-zinc-200 hover:text-white hover:bg-zinc-700 transition cursor-pointer"
            aria-label={mobileMenuOpen ? t('ปิดเมนู', 'Close menu') : t('เปิดเมนู', 'Open menu')}
            aria-expanded={mobileMenuOpen}
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Responsive Mobile & Tablet Navigation Drawer (< 1024px) */}
      {mobileMenuOpen && (
        <div className="lg:hidden bg-[#15181E] border-t border-zinc-800 px-4 py-4 space-y-4 shadow-2xl max-h-[calc(100vh-4rem)] overflow-y-auto">
          {user && (
            <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-zinc-900/90 border border-zinc-800">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-full bg-zinc-800 border border-zinc-700 text-zinc-100 font-bold text-xs flex items-center justify-center shrink-0">
                  {initials}
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-bold text-white truncate">{displayName}</div>
                  <div className="text-[11px] font-semibold text-[#2584FF]">{user.role}</div>
                </div>
              </div>
              <button
                type="button"
                onClick={handleLogout}
                className="px-3 py-1.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-semibold flex items-center gap-1.5 shrink-0"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>{t('ออกจากระบบ', 'Sign out')}</span>
              </button>
            </div>
          )}

          {/* Main Navigation Links */}
          <div className="space-y-1">
            <div className="px-2 pb-1 text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-500">
              {t('เมนูหลัก', 'Main Navigation')}
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {[
                { href: '/', label: t('หน้าแรก', 'Home'), icon: Home },
                { href: '/jobs', label: t('ค้นหางาน', 'Jobs'), icon: Briefcase },
                { href: '/assessments', label: t('ประเมินทักษะ', 'Assessments'), icon: Code2 },
                { href: '/courses', label: t('คอร์สเรียน', 'Courses'), icon: GraduationCap },
              ].map((nav) => {
                const IconComp = nav.icon;
                const active = isActive(nav.href);
                return (
                  <Link
                    key={nav.href}
                    href={nav.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition ${
                      active
                        ? 'bg-[#1D7AFC] text-white shadow-sm'
                        : 'bg-zinc-900/70 text-zinc-300 hover:bg-zinc-800 hover:text-white border border-zinc-800/80'
                    }`}
                  >
                    <IconComp className="w-4 h-4 shrink-0" />
                    <span className="truncate">{nav.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>

          {/* Role-Specific Menu Links */}
          {roleMenuItems.length > 0 && (
            <div className="space-y-1 pt-2 border-t border-zinc-800/80">
              <div className="px-2 pb-1 text-[10px] font-mono font-bold uppercase tracking-wider text-[#2584FF]">
                {user?.role === 'ADMIN'
                  ? t('เมนูผู้ดูแลระบบ', 'Admin Menu')
                  : user?.role === 'COMPANY'
                    ? t('เมนูสำหรับบริษัท', 'Company Menu')
                    : t('เมนูผู้สมัครงาน', 'Candidate Menu')}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                {roleMenuItems.map((item) => {
                  const active = isActive(item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setMobileMenuOpen(false)}
                      className={`flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs transition ${
                        active
                          ? 'bg-white/[0.1] text-white font-bold border border-white/15'
                          : 'text-zinc-300 hover:bg-white/[0.04] hover:text-white font-medium'
                      }`}
                    >
                      <span>{item.label}</span>
                      {active && <span className="w-2 h-2 rounded-full bg-[#2584FF]" />}
                    </Link>
                  );
                })}
              </div>
            </div>
          )}

          {/* Guest Auth Actions on Mobile */}
          {!user && (
            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-zinc-800">
              <Link
                href="/login"
                onClick={() => setMobileMenuOpen(false)}
                className="py-2.5 px-4 rounded-xl text-center text-xs font-semibold bg-zinc-800 text-zinc-200 hover:text-white border border-zinc-700"
              >
                {t('เข้าสู่ระบบ', 'Sign In')}
              </Link>
              <Link
                href="/register"
                onClick={() => setMobileMenuOpen(false)}
                className="py-2.5 px-4 rounded-xl text-center text-xs font-bold bg-[#1D7AFC] text-white hover:bg-blue-600"
              >
                {t('เริ่มต้นใช้งาน', 'Get Started')}
              </Link>
            </div>
          )}
        </div>
      )}
    </header>
  );
}

export function MainContainer({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (pathname === '/') {
    return <main className="flex-1 w-full bg-[#F2F4F8]">{children}</main>;
  }
  return (
    <main className="flex-1 max-w-[1360px] w-full mx-auto px-4 sm:px-6 lg:px-10 py-5 sm:py-8">
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
