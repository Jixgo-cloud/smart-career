'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { CompanyLogo, resolveJobLogoUrl } from '@/components/CompanyLogo';
import { CourseDetailModal } from '@/components/CourseDetailModal';

type QuickJobFilter = 'ALL' | 'FULL_TIME' | 'REMOTE' | 'INTERNAL';
type QuickCourseProvider = 'ALL' | 'YOUTUBE' | 'UDEMY';

const AVATAR_PALETTES = [
  'bg-[#DBEAFE] text-[#1D4ED8] border-blue-100',
  'bg-[#FCE7F3] text-[#BE185D] border-pink-100',
  'bg-[#FEF3C7] text-[#B45309] border-amber-100',
  'bg-[#D1FAE5] text-[#047857] border-emerald-100',
  'bg-[#EDE9FE] text-[#6D28D9] border-purple-100',
  'bg-[#E0E7FF] text-[#4338CA] border-indigo-100',
];

const QUICK_TRY_GITHUB_USERS = ['octocat', 'vercel', 'facebook'];

function getCompanyDisplayName(job: any): string {
  return (
    job.company?.name ||
    job.company?.companyName ||
    job.companyName ||
    job.externalCompanyName ||
    'บริษัทชั้นนำ'
  );
}

function getCompanyInitials(name: string): string {
  const clean = name.replace(/[^a-zA-Z0-9ก-๙\s]/g, '').trim();
  if (!clean) return 'SC';
  const parts = clean.split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return clean.slice(0, 2).toUpperCase();
}

function getAvatarPalette(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  }
  return AVATAR_PALETTES[hash % AVATAR_PALETTES.length];
}

function formatCompactSalary(min?: number | null, max?: number | null): {
  main: string;
  unit: string;
} {
  if (min && max) {
    const fmt = (n: number) =>
      n >= 1000 && n % 1000 === 0 ? `฿${(n / 1000).toFixed(0)}k` : `฿${n.toLocaleString()}`;
    return { main: `${fmt(min)} - ${fmt(max)}`, unit: '/เดือน' };
  }
  if (min) {
    const fmt =
      min >= 1000 && min % 1000 === 0
        ? `฿${(min / 1000).toFixed(0)}k+`
        : `฿${min.toLocaleString()}+`;
    return { main: fmt, unit: '/เดือน' };
  }
  if (max) {
    const fmt =
      max >= 1000 && max % 1000 === 0
        ? `สูงสุด ฿${(max / 1000).toFixed(0)}k`
        : `สูงสุด ฿${max.toLocaleString()}`;
    return { main: fmt, unit: '/เดือน' };
  }
  return { main: 'เงินเดือนตามตกลง', unit: '' };
}

function isInternalJob(job: any): boolean {
  if (typeof job.isExternal === 'boolean') {
    return !job.isExternal;
  }
  return (job.source || 'INTERNAL') === 'INTERNAL';
}

export default function HomePage() {
  const router = useRouter();
  const { user } = useAuth();

  // 1. Public GitHub Context Analyzer State
  const [githubUsername, setGithubUsername] = useState('');
  const [githubLoading, setGithubLoading] = useState(false);
  const [githubError, setGithubError] = useState('');
  const [githubResult, setGithubResult] = useState<any>(null);

  // 2. Jobs Data & Quick Filter State (Featured 2x2 Grid)
  const [allJobs, setAllJobs] = useState<any[]>([]);
  const [jobsLoading, setJobsLoading] = useState(true);
  const [jobQuickFilter, setJobQuickFilter] = useState<QuickJobFilter>('ALL');
  const [favoritePendingIds, setFavoritePendingIds] = useState<Record<string, boolean>>({});

  // 3. Recommended Courses State
  const [allCourses, setAllCourses] = useState<any[]>([]);
  const [coursesLoading, setCoursesLoading] = useState(true);
  const [courseProviderFilter, setCourseProviderFilter] = useState<QuickCourseProvider>('ALL');
  const [selectedCourse, setSelectedCourse] = useState<any | null>(null);

  // 4. Skill Assessments State
  const [allAssessments, setAllAssessments] = useState<any[]>([]);
  const [assessmentsLoading, setAssessmentsLoading] = useState(true);

  const loadLandingData = useCallback(async () => {
    setJobsLoading(true);
    setCoursesLoading(true);
    setAssessmentsLoading(true);

    const [jobsRes, coursesRes, assessmentsRes] = await Promise.allSettled([
      apiFetch<any>('/jobs?limit=50&sortBy=publishedAt'),
      apiFetch<any[]>('/recommendations/courses'),
      apiFetch<any[]>('/assessments'),
    ]);

    if (jobsRes.status === 'fulfilled') {
      const val = jobsRes.value;
      const list = Array.isArray(val?.jobs)
        ? val.jobs
        : Array.isArray(val?.items)
          ? val.items
          : Array.isArray(val)
            ? val
            : [];
      setAllJobs(list);
    } else {
      setAllJobs([]);
    }
    setJobsLoading(false);

    if (coursesRes.status === 'fulfilled' && Array.isArray(coursesRes.value)) {
      setAllCourses(coursesRes.value);
    } else {
      setAllCourses([]);
    }
    setCoursesLoading(false);

    if (assessmentsRes.status === 'fulfilled' && Array.isArray(assessmentsRes.value)) {
      setAllAssessments(assessmentsRes.value);
    } else {
      setAllAssessments([]);
    }
    setAssessmentsLoading(false);
  }, []);

  useEffect(() => {
    loadLandingData();
  }, [loadLandingData]);

  const runGithubAnalysis = async (rawInput: string) => {
    const cleanInput = rawInput
      .trim()
      .replace(/^https?:\/\/(www\.)?github\.com\//i, '')
      .replace(/^@/, '')
      .split('/')[0]
      .trim();

    if (!cleanInput) return;
    setGithubUsername(cleanInput);
    setGithubLoading(true);
    setGithubError('');
    setGithubResult(null);
    try {
      const res = await apiFetch<any>(`/github/public/${encodeURIComponent(cleanInput)}`);
      setGithubResult(res);
    } catch (err: any) {
      setGithubError(err.message || 'ไม่สามารถดึงข้อมูล GitHub ได้');
    } finally {
      setGithubLoading(false);
    }
  };

  const analyzeGithub = async (e: React.FormEvent) => {
    e.preventDefault();
    await runGithubAnalysis(githubUsername);
  };

  const handleToggleFavorite = async (e: React.MouseEvent, jobId: string) => {
    e.preventDefault();
    e.stopPropagation();

    if (!user) {
      router.push('/login');
      return;
    }

    if (favoritePendingIds[jobId]) return;

    setFavoritePendingIds((prev) => ({ ...prev, [jobId]: true }));
    setAllJobs((prev) =>
      prev.map((j) => (j.id === jobId ? { ...j, isFavorited: !j.isFavorited } : j)),
    );

    try {
      const res = await apiFetch<{ isFavorited: boolean }>(`/jobs/${jobId}/favorite`, {
        method: 'POST',
      });
      if (typeof res?.isFavorited === 'boolean') {
        setAllJobs((prev) =>
          prev.map((j) => (j.id === jobId ? { ...j, isFavorited: res.isFavorited } : j)),
        );
      }
    } catch {
      setAllJobs((prev) =>
        prev.map((j) => (j.id === jobId ? { ...j, isFavorited: !j.isFavorited } : j)),
      );
    } finally {
      setFavoritePendingIds((prev) => ({ ...prev, [jobId]: false }));
    }
  };

  // Filtered Featured Jobs (2x2 Grid = 4 jobs on Landing Page)
  const filteredJobs = useMemo(() => {
    return allJobs.filter((job) => {
      const empType = job.employmentType || job.jobType || 'FULL_TIME';
      if (jobQuickFilter === 'FULL_TIME') {
        return empType === 'FULL_TIME';
      }
      if (jobQuickFilter === 'REMOTE') {
        return empType === 'REMOTE' || Boolean(job.isRemote);
      }
      if (jobQuickFilter === 'INTERNAL') {
        return isInternalJob(job);
      }
      return true;
    });
  }, [allJobs, jobQuickFilter]);

  const featuredJobs = useMemo(() => filteredJobs.slice(0, 4), [filteredJobs]);

  // Filtered Featured Courses (3-Column Grid = 3 courses on Landing Page)
  const filteredCourses = useMemo(() => {
    if (courseProviderFilter === 'ALL') return allCourses;
    return allCourses.filter(
      (c) => String(c.provider || '').toUpperCase() === courseProviderFilter,
    );
  }, [allCourses, courseProviderFilter]);

  const featuredCourses = useMemo(() => filteredCourses.slice(0, 3), [filteredCourses]);

  // Featured Assessments (3-Column Grid = 3 assessments on Landing Page)
  const featuredAssessments = useMemo(() => allAssessments.slice(0, 3), [allAssessments]);

  // Normalize GitHub public analysis result
  const normalizedGithub = useMemo(() => {
    if (!githubResult) return null;

    const repoCount =
      githubResult.repositoryCount ??
      githubResult.repoCount ??
      (Array.isArray(githubResult.repositories)
        ? githubResult.repositories.length
        : Array.isArray(githubResult.repos)
          ? githubResult.repos.length
          : 0);

    const scoreContribution = githubResult.scoreContribution ?? 0;
    const policyNote =
      githubResult.policyNote ||
      githubResult.note ||
      'ข้อมูลจาก GitHub ใช้เป็นหลักฐานบริบทเท่านั้น และไม่ถูกนำไปคำนวณเป็นคะแนนทักษะ (scoreContribution = 0)';

    let skills: Array<{ skillName: string; repoCount: number }> = [];
    if (
      Array.isArray(githubResult.detectedLanguages) &&
      githubResult.detectedLanguages.length > 0
    ) {
      skills = githubResult.detectedLanguages.map((l: any) => ({
        skillName: l.name || String(l),
        repoCount: Number(l.repoCount ?? 1),
      }));
    } else if (
      Array.isArray(githubResult.detectedSkills) &&
      githubResult.detectedSkills.length > 0
    ) {
      skills = githubResult.detectedSkills.map((s: any) => ({
        skillName: s.skillName || s.name,
        repoCount: Number(s.repoCount ?? 1),
      }));
    } else if (
      githubResult.languageByteShare &&
      typeof githubResult.languageByteShare === 'object'
    ) {
      skills = Object.keys(githubResult.languageByteShare).map((lang) => ({
        skillName: lang,
        repoCount: 1,
      }));
    }

    const detectedFrameworks: Array<{ name: string; repoCount: number }> = Array.isArray(
      githubResult.detectedFrameworks,
    )
      ? githubResult.detectedFrameworks.map((f: any) => ({
          name: f.name || String(f),
          repoCount: Number(f.repoCount ?? 1),
        }))
      : [];

    const rawRepos = Array.isArray(githubResult.repositories)
      ? githubResult.repositories
      : Array.isArray(githubResult.repos)
        ? githubResult.repos
        : [];

    const repos = rawRepos.map((r: any) => ({
      name: r.repoName || r.name || 'repository',
      url: r.url || `https://github.com/${githubResult.username}/${r.repoName || r.name || ''}`,
      stars: Number(r.stargazersCount ?? r.stars ?? 0),
      description: r.description || null,
      detectedTools:
        Array.isArray(r.detectedTools) && r.detectedTools.length > 0
          ? r.detectedTools
          : Array.isArray(r.topics) && r.topics.length > 0
            ? r.topics
            : r.language
              ? [r.language]
              : [],
    }));

    return {
      username: githubResult.username,
      repoCount,
      scoreContribution,
      policyNote,
      skills,
      detectedFrameworks,
      repos,
    };
  }, [githubResult]);

  return (
    <div className="min-h-screen bg-[#F2F4F8]">
      {/* ===================================================================== */}
      {/* 1. TOP DARK HERO SECTION (#111317) + QUICK-TRY CHIPS                  */}
      {/* ===================================================================== */}
      <section className="bg-[#111317] text-white pt-6 pb-9 relative overflow-hidden">
        <div className="max-w-[1360px] mx-auto px-4 sm:px-6 lg:px-10 relative">
          <div className="hidden lg:block absolute right-14 top-0 w-64 h-64 rounded-full bg-blue-500/15 blur-3xl pointer-events-none" />

          {/* Hero Top Row */}
          <div className="flex items-center justify-between gap-6 mb-5 relative z-10">
            <div className="max-w-3xl">
              <div className="flex items-center gap-3">
                <h1 className="text-2xl sm:text-3xl md:text-[36px] font-extrabold tracking-tight text-white leading-tight">
                  วิเคราะห์บริบท GitHub Repository สาธารณะ
                </h1>
                <span className="text-[#2584FF] text-2xl md:text-3xl font-extrabold">✦</span>
              </div>
            </div>

            {/* Unobscured Circular GitHub Octocat Emblem */}
            <div className="hidden sm:flex items-center justify-center shrink-0">
              <div className="w-20 h-20 md:w-24 md:h-24 rounded-full bg-gradient-to-b from-zinc-800/80 to-zinc-900/50 border border-white/10 flex items-center justify-center shadow-2xl">
                <svg
                  className="w-12 h-12 md:w-14 md:h-14 text-zinc-100/90 drop-shadow-xl"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    clipRule="evenodd"
                    d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
                  />
                </svg>
              </div>
            </div>
          </div>

          {/* Giant White Pill Bar */}
          <form
            onSubmit={analyzeGithub}
            className="bg-white rounded-[22px] p-2 shadow-2xl flex flex-col md:flex-row items-stretch md:items-center justify-between gap-2 relative z-10"
          >
            <div className="flex items-center gap-3 pl-4 pr-3 py-2 flex-1">
              <div className="w-9 h-9 rounded-full bg-slate-900 text-white flex items-center justify-center shrink-0">
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                  <path
                    fillRule="evenodd"
                    clipRule="evenodd"
                    d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
                  />
                </svg>
              </div>
              <span className="text-slate-400 font-mono text-sm font-semibold select-none">
                github.com/
              </span>
              <input
                type="text"
                value={githubUsername}
                onChange={(e) => setGithubUsername(e.target.value)}
                placeholder="กรอกชื่อผู้ใช้ GitHub เช่น octocat หรือ candidate-demo (ไม่ต้องล็อกอิน)..."
                aria-label="ชื่อผู้ใช้ GitHub สาธารณะ"
                className="w-full text-slate-900 placeholder:text-slate-400 font-semibold text-sm bg-transparent focus:outline-none"
              />
            </div>

            <div className="flex items-center justify-between md:justify-end gap-3 pl-4 md:pl-3 pr-1 py-1 md:border-l border-slate-200">
              {normalizedGithub && (
                <div className="hidden xl:flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold whitespace-nowrap">
                  <span>✓ วิเคราะห์สำเร็จ ({normalizedGithub.repoCount} Public Repos)</span>
                </div>
              )}

              <button
                type="submit"
                disabled={githubLoading || !githubUsername.trim()}
                className="w-full md:w-auto bg-[#1D7AFC] hover:bg-[#1565D8] disabled:opacity-60 text-white font-bold text-sm px-7 py-3.5 rounded-2xl shadow-md shadow-blue-500/20 transition-all whitespace-nowrap cursor-pointer inline-flex items-center justify-center gap-2"
              >
                <span>{githubLoading ? 'กำลังวิเคราะห์...' : 'วิเคราะห์ GitHub'}</span>
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M13 7l5 5m0 0l-5 5m5-5H6"
                  />
                </svg>
              </button>
            </div>
          </form>

          {/* 1-Click Quick-Try Chips + Policy Note */}
          <div className="flex flex-wrap items-center justify-between gap-3 mt-3.5 px-1 relative z-10">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="text-zinc-400 font-medium">ทดลองสแกนด่วน (1-Click):</span>
              {QUICK_TRY_GITHUB_USERS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => runGithubAnalysis(preset)}
                  disabled={githubLoading}
                  className="px-3 py-1 rounded-full bg-white/[0.08] hover:bg-white/[0.16] border border-white/10 text-zinc-200 hover:text-white font-mono text-[11px] font-semibold transition-all duration-150 hover:scale-105 cursor-pointer"
                >
                  @{preset}
                </button>
              ))}
            </div>
            <span className="text-[11px] text-zinc-400 font-mono">
              scoreContribution = 0 (ใช้เป็นหลักฐานบริบทเท่านั้น)
            </span>
          </div>

          {githubError && (
            <div
              role="alert"
              className="mt-4 p-3.5 rounded-2xl bg-red-500/15 border border-red-400/30 text-red-200 text-xs font-medium"
            >
              {githubError}
            </div>
          )}
        </div>
      </section>

      {/* ===================================================================== */}
      {/* MAIN CONTENT CONTAINER (#F2F4F8)                                      */}
      {/* ===================================================================== */}
      <div className="max-w-[1360px] mx-auto px-4 sm:px-6 lg:px-10 py-8 space-y-11">
        {/* EXPANDED GITHUB ANALYSIS RESULT CARD (Conditional) */}
        {normalizedGithub && (
          <section
            aria-label="ผลการวิเคราะห์บริบทจาก GitHub"
            className="bg-white rounded-[22px] p-6 border border-slate-200/80 shadow-sm space-y-5"
          >
            <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-slate-900 text-white flex items-center justify-center font-mono font-bold text-sm">
                  GH
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-base font-extrabold text-slate-900">
                      ผลการวิเคราะห์บริบทจาก GitHub:{' '}
                      <span className="text-[#1D7AFC] font-mono">@{normalizedGithub.username}</span>{' '}
                      <span className="text-slate-500 font-semibold text-sm">
                        ({normalizedGithub.repoCount} repositories)
                      </span>
                    </h2>
                    <span className="px-2.5 py-0.5 rounded-md bg-amber-50 border border-amber-200 text-amber-800 font-mono text-[11px] font-semibold">
                      scoreContribution: {normalizedGithub.scoreContribution} (หลักฐานบริบทเท่านั้น)
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">{normalizedGithub.policyNote}</p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setGithubResult(null)}
                className="text-xs font-semibold text-slate-400 hover:text-slate-700 px-3 py-1.5 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
              >
                ล้างผลลัพธ์ ✕
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Left 5 Cols: Detected Languages & Frameworks */}
              <div className="lg:col-span-5 space-y-4">
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-500">
                      ภาษาโปรแกรมและทักษะที่ตรวจพบ (detectedLanguages)
                    </h3>
                    <span className="text-[11px] font-semibold text-slate-400">
                      พบ {normalizedGithub.skills.length} รายการ
                    </span>
                  </div>

                  {normalizedGithub.skills.length === 0 ? (
                    <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/70 text-xs text-slate-500">
                      ไม่พบข้อมูลภาษาโปรแกรมจาก Repository สาธารณะของผู้ใช้นี้
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-2.5">
                      {normalizedGithub.skills.map((s) => (
                        <div
                          key={s.skillName}
                          className="p-3 rounded-xl bg-slate-50/90 border border-slate-200/70 flex flex-col justify-between"
                        >
                          <div className="flex items-center justify-between gap-1">
                            <span className="font-bold text-slate-900 text-xs truncate">
                              {s.skillName}
                            </span>
                            <span className="px-1.5 py-0.5 rounded bg-blue-50 text-[#1D7AFC] font-mono text-[10px] font-semibold shrink-0">
                              พบใน {s.repoCount} โปรเจกต์
                            </span>
                          </div>
                          <div className="text-[10px] text-slate-400 mt-1.5 font-medium">
                            Context (คะแนน = 0)
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {normalizedGithub.detectedFrameworks.length > 0 && (
                  <div className="p-3.5 rounded-xl bg-indigo-50/60 border border-indigo-100 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-indigo-950">
                        Frameworks & Libraries จาก package.json
                      </span>
                      <span className="text-[10px] font-mono font-semibold text-indigo-600">
                        Dependencies
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {normalizedGithub.detectedFrameworks.map((fw) => (
                        <span
                          key={fw.name}
                          className="px-2.5 py-1 rounded-lg bg-white border border-indigo-200/80 text-indigo-700 font-semibold text-[11px]"
                        >
                          {fw.name} ({fw.repoCount})
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Right 7 Cols: Recent Public Repositories */}
              <div className="lg:col-span-7 space-y-2.5">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-500">
                    Repository สาธารณะล่าสุด (สูงสุด 6 รายการ)
                  </h3>
                  <span className="text-[11px] font-mono text-slate-400">
                    github.com/{normalizedGithub.username}
                  </span>
                </div>

                {normalizedGithub.repos.length === 0 ? (
                  <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/70 text-xs text-slate-500">
                    ไม่มีรายการ Repository สาธารณะ
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {normalizedGithub.repos.slice(0, 6).map((r: any) => (
                      <div
                        key={r.name}
                        className="p-3.5 rounded-xl bg-slate-50/90 border border-slate-200/70 flex flex-col justify-between gap-2"
                      >
                        <div>
                          <div className="flex items-center justify-between gap-2">
                            <a
                              href={r.url}
                              target="_blank"
                              rel="noreferrer"
                              className="font-mono font-bold text-xs text-[#1D7AFC] hover:underline truncate"
                            >
                              {r.name} ↗
                            </a>
                            <span className="text-[11px] font-semibold text-amber-600 shrink-0">
                              ★ {r.stars}
                            </span>
                          </div>
                          {r.description && (
                            <p className="text-[11px] text-slate-500 line-clamp-1 mt-1">
                              {r.description}
                            </p>
                          )}
                        </div>
                        {r.detectedTools.length > 0 && (
                          <div className="flex flex-wrap gap-1 pt-1">
                            {r.detectedTools.slice(0, 4).map((t: string) => (
                              <span
                                key={t}
                                className="px-2 py-0.5 rounded bg-slate-200/70 text-slate-700 font-mono text-[10px] font-medium"
                              >
                                {t}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </section>
        )}

        {/* =================================================================== */}
        {/* 2. SWISS MINIMALIST PLATFORM OVERVIEW (HOW SMARTCAREER WORKS)       */}
        {/* =================================================================== */}
        <section
          aria-label="เกี่ยวกับแพลตฟอร์ม SmartCareer"
          className="border-y border-slate-300/80 py-7"
        >
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* Left 3 Columns: Editorial Minimalist Statement + Live Numbers */}
            <div className="lg:col-span-3 lg:pr-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="w-1.5 h-1.5 rounded-full bg-slate-900" />
                <span className="text-[10px] font-mono font-bold uppercase tracking-[0.18em] text-slate-400">
                  HOW SMARTCAREER WORKS
                </span>
              </div>
              <h2 className="text-[19px] font-extrabold text-slate-900 leading-snug tracking-tight">
                เกี่ยวกับแพลตฟอร์ม
              </h2>
              <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
                คัดกรองและจับคู่อาชีพสายเทคโนโลยีด้วยหลักฐานจริง โปร่งใส วัดผลได้
              </p>
              <div className="mt-4 pt-3.5 border-t border-slate-200/80 flex items-center gap-4 font-mono">
                <div>
                  <div className="text-sm font-extrabold text-slate-900">
                    {jobsLoading ? '...' : allJobs.length}
                  </div>
                  <div className="text-[10px] text-slate-400">ตำแหน่งงาน</div>
                </div>
                <div className="h-6 w-[1px] bg-slate-200" />
                <div>
                  <div className="text-sm font-extrabold text-slate-900">
                    {assessmentsLoading ? '...' : allAssessments.length}
                  </div>
                  <div className="text-[10px] text-slate-400">ข้อสอบกลาง</div>
                </div>
                <div className="h-6 w-[1px] bg-slate-200" />
                <div>
                  <div className="text-sm font-extrabold text-slate-900">
                    {coursesLoading ? '...' : allCourses.length}
                  </div>
                  <div className="text-[10px] text-slate-400">คอร์สเรียน</div>
                </div>
              </div>
            </div>

            {/* Right 9 Columns: 3 Minimalist Columns Divided by 1px Hairlines */}
            <div className="lg:col-span-9 grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-slate-300/70 gap-6 md:gap-0">
              {/* Step 01 */}
              <div className="md:px-6 md:first:pl-2">
                <div className="flex items-baseline justify-between mb-2">
                  <span className="text-2xl font-light font-mono text-slate-400 tracking-tight">
                    01
                  </span>
                  <span className="text-[10px] font-mono font-semibold text-slate-500 border border-slate-300/90 rounded px-2 py-0.5">
                    Context = 0
                  </span>
                </div>
                <h3 className="text-sm font-extrabold text-slate-900 mb-1">
                  สแกนบริบท GitHub สาธารณะ
                </h3>
                <p className="text-xs text-slate-500 leading-relaxed mb-3">
                  ดึงภาษาและไลบรารีจาก{' '}
                  <code className="font-mono text-slate-700">package.json</code>{' '}
                  เพื่อแสดงหลักฐานโปรเจกต์จริงโดยไม่บิดเบือนคะแนนสอบ
                </p>
                <Link
                  href="/profile"
                  className="inline-flex items-center gap-1 text-xs font-bold text-slate-900 hover:text-[#1D7AFC] border-b border-slate-900 hover:border-[#1D7AFC] pb-0.5 transition-colors"
                >
                  <span>จัดการโปรไฟล์</span>
                  <span>↗</span>
                </Link>
              </div>

              {/* Step 02 */}
              <div className=" pt-5 md:pt-0 md:px-6">
                <div className="flex items-baseline justify-between mb-2">
                  <span className="text-2xl font-light font-mono text-[#2563EB] tracking-tight">
                    02
                  </span>
                  <span className="text-[10px] font-mono font-semibold text-[#2563EB] border border-[#2563EB]/40 rounded px-2 py-0.5">
                    PRACTICAL_CODING
                  </span>
                </div>
                <h3 className="text-sm font-extrabold text-slate-900 mb-1">
                  สอบปฏิบัติมาตรฐานกลาง
                </h3>
                <p className="text-xs text-slate-500 leading-relaxed mb-3">
                  เฉพาะผลสอบปฏิบัติกลางเท่านั้นที่นำไปคำนวณเป็น Global Skill Score
                  พร้อมรับเหรียญรับรองทักษะ
                </p>
                <Link
                  href="/assessments"
                  className="inline-flex items-center gap-1 text-xs font-bold text-[#2563EB] hover:text-blue-800 border-b border-[#2563EB] pb-0.5 transition-colors"
                >
                  <span>ไปที่ศูนย์สอบ</span>
                  <span>↗</span>
                </Link>
              </div>

              {/* Step 03 */}
              <div className="pt-5 md:pt-0 md:px-6 md:last:pr-0">
                <div className="flex items-baseline justify-between mb-2">
                  <span className="text-2xl font-light font-mono text-slate-400 tracking-tight">
                    03
                  </span>
                  <span className="text-[10px] font-mono font-semibold text-slate-500 border border-slate-300/90 rounded px-2 py-0.5">
                    Match & Gaps
                  </span>
                </div>
                <h3 className="text-sm font-extrabold text-slate-900 mb-1">
                  จับคู่งาน & ปิดช่องว่างทักษะ
                </h3>
                <p className="text-xs text-slate-500 leading-relaxed mb-3">
                  คำนวณเปอร์เซ็นต์ Match กับตำแหน่งงานจริง และแนะนำคอร์สจาก YouTube & Udemy
                  สำหรับทักษะที่ขาด
                </p>
                <Link
                  href="/learning-plan"
                  className="inline-flex items-center gap-1 text-xs font-bold text-slate-900 hover:text-[#1D7AFC] border-b border-slate-900 hover:border-[#1D7AFC] pb-0.5 transition-colors"
                >
                  <span>ดูแผนพัฒนาทักษะ</span>
                  <span>↗</span>
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* =================================================================== */}
        {/* 3. ตำแหน่งงานแนะนำ (2x2 WIDE SOFT CARDS + MATCH PROGRESS BAR)       */}
        {/* =================================================================== */}
        <section aria-label="ตำแหน่งงานแนะนำ" className="space-y-5">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-xl sm:text-[22px] font-extrabold text-slate-900 tracking-tight">
                ตำแหน่งงานแนะนำ{' '}
                <span className="text-slate-400 font-normal text-base sm:text-lg">
                  (Recommended jobs)
                </span>
              </h2>
              <span className="px-3 py-1 rounded-full bg-slate-200/80 text-slate-600 text-xs font-bold">
                แสดง {featuredJobs.length} ไฮไลต์จาก {filteredJobs.length} ตำแหน่ง
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <div className="inline-flex flex-wrap sm:flex-nowrap items-center bg-white rounded-2xl sm:rounded-full p-1 border border-slate-200/80 shadow-sm text-xs font-bold max-w-full">
                {(
                  [
                    { key: 'ALL', label: 'ทั้งหมด' },
                    { key: 'FULL_TIME', label: 'Full-Time' },
                    { key: 'REMOTE', label: 'Remote' },
                    { key: 'INTERNAL', label: 'รับสมัครตรง' },
                  ] as Array<{ key: QuickJobFilter; label: string }>
                ).map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setJobQuickFilter(tab.key)}
                    className={`px-3 sm:px-3.5 py-1.5 rounded-full transition-all cursor-pointer whitespace-nowrap ${
                      jobQuickFilter === tab.key
                        ? 'bg-slate-900 text-white shadow-sm'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <Link
                href="/jobs"
                className="px-4 py-2 rounded-full bg-white hover:bg-blue-50/60 border border-slate-200/90 hover:border-blue-200 text-xs font-bold text-[#2563EB] shadow-sm transition-all whitespace-nowrap"
              >
                ดูตำแหน่งงานและตัวกรองทั้งหมด (/jobs) →
              </Link>
            </div>
          </div>

          {jobsLoading ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {Array.from({ length: 4 }).map((_, idx) => (
                <div
                  key={idx}
                  className="bg-white rounded-[20px] p-5 border border-slate-200/70 h-56 animate-pulse flex flex-col justify-between"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-slate-200" />
                    <div className="space-y-2 flex-1">
                      <div className="h-4 bg-slate-200 rounded w-3/4" />
                      <div className="h-3 bg-slate-100 rounded w-1/2" />
                    </div>
                  </div>
                  <div className="h-8 bg-slate-100 rounded-xl w-full" />
                  <div className="h-6 bg-slate-200 rounded w-1/3" />
                </div>
              ))}
            </div>
          ) : featuredJobs.length === 0 ? (
            <div className="bg-white rounded-[20px] p-10 border border-slate-200/70 text-center space-y-3">
              <p className="text-sm font-bold text-slate-800">
                ไม่พบตำแหน่งงานในหมวดหมู่นี้
              </p>
              <button
                type="button"
                onClick={() => setJobQuickFilter('ALL')}
                className="px-4 py-2 rounded-xl bg-[#1D7AFC] text-white text-xs font-bold cursor-pointer"
              >
                แสดงงานทั้งหมด
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {featuredJobs.map((job) => {
                const companyName = getCompanyDisplayName(job);
                const empType = job.employmentType || job.jobType || 'FULL_TIME';
                const internal = isInternalJob(job);
                const matchVal = job.matchScore ?? job.match?.overallScore;
                const hasMatch = matchVal !== undefined && matchVal !== null;
                const matchPct = hasMatch ? Math.round(Number(matchVal)) : null;

                const jobSkills: any[] = Array.isArray(job.skills) ? job.skills : [];
                const topSkills = jobSkills
                  .map((js) => js?.skill?.name)
                  .filter(Boolean)
                  .slice(0, 3);
                const primarySkill = topSkills[0] || 'Tech Role';

                // Visual progress bar value (uses real matchPct when available, or assessment/skill coverage)
                const progressPct =
                  matchPct !== null
                    ? Math.max(10, Math.min(100, matchPct))
                    : Math.min(100, Math.max(40, topSkills.length * 30));

                const salaryInfo = formatCompactSalary(job.salaryMin, job.salaryMax);
                const cleanDescription = (job.description || '')
                  .replace(/[#*`_~>-]/g, ' ')
                  .replace(/\s+/g, ' ')
                  .trim();

                return (
                  <Link
                    href={`/jobs/${job.id}`}
                    key={job.id}
                    className="bg-white rounded-[20px] p-5 border border-slate-200/75 shadow-[0_4px_20px_-4px_rgba(15,23,42,0.035)] hover:border-[#2584FF]/55 hover:shadow-[0_16px_36px_-8px_rgba(37,99,235,0.14)] hover:-translate-y-1 hover:scale-[1.006] transition-all duration-200 flex flex-col justify-between group"
                  >
                    <div>
                      {/* Card Header */}
                      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2.5 mb-3">
                        <div className="flex items-center gap-3.5 min-w-0">
                          <CompanyLogo
                            logoUrl={resolveJobLogoUrl(job)}
                            companyName={companyName}
                            size="md"
                            className="w-12 h-12 rounded-2xl text-sm shrink-0"
                          />
                          <div className="min-w-0">
                            <h3 className="font-extrabold text-slate-900 text-[15px] sm:text-base leading-snug line-clamp-1 group-hover:text-[#1D4ED8] transition-colors">
                              {job.title}
                            </h3>
                            <p className="text-xs text-slate-400 truncate mt-0.5 font-medium">
                              {companyName}
                              {job.location ? ` • ${job.location}` : ''}
                            </p>
                          </div>
                        </div>

                        {/* Top-Right Pastel Badges + Favorite Heart */}
                        <div className="flex flex-wrap items-center sm:justify-end gap-1.5 shrink-0">
                          <span className="px-2.5 py-1 rounded-lg bg-[#EDE9FE] text-[#6D28D9] text-[11px] font-bold">
                            {matchPct !== null ? `Match ${matchPct}%` : primarySkill}
                          </span>
                          <span className="px-2.5 py-1 rounded-lg bg-[#DCFCE7] text-[#15803D] text-[11px] font-bold">
                            {empType}
                          </span>
                          <span className="px-2.5 py-1 rounded-lg bg-[#FFEDD5] text-[#C2410C] text-[11px] font-bold">
                            {internal ? 'รับสมัครตรง' : job.source || 'External'}
                          </span>
                          <button
                            type="button"
                            onClick={(e) => handleToggleFavorite(e, job.id)}
                            disabled={favoritePendingIds[job.id]}
                            aria-label={job.isFavorited ? 'ลบออกจากงานที่บันทึกไว้' : 'บันทึกงานนี้'}
                            className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ml-0.5 shrink-0 ${
                              job.isFavorited
                                ? 'bg-rose-50 text-rose-500'
                                : 'bg-slate-50 text-slate-300 hover:text-rose-500 hover:bg-rose-50/50'
                            }`}
                          >
                            {job.isFavorited ? (
                              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                              </svg>
                            ) : (
                              <svg
                                className="w-4 h-4"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                viewBox="0 0 24 24"
                              >
                                <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                              </svg>
                            )}
                          </button>
                        </div>
                      </div>

                      {/* Clean 2-Line Description */}
                      <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed mb-3.5 min-h-[2.4rem]">
                        {cleanDescription || 'ดูรายละเอียดตำแหน่งงานและเกณฑ์ทักษะเพิ่มเติมในประกาศ'}
                      </p>

                      {/* Skill Mini-Chips + Visual Match Progress Bar */}
                      <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50/90 rounded-xl px-3.5 py-2 mb-3.5 border border-slate-100">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-[11px] text-slate-400 font-medium">ทักษะหลัก:</span>
                          {topSkills.length > 0 ? (
                            topSkills.map((sk) => (
                              <span
                                key={sk}
                                className="px-2 py-0.5 rounded-md bg-white border border-slate-200/80 text-slate-700 text-[11px] font-semibold"
                              >
                                {sk}
                              </span>
                            ))
                          ) : (
                            <span className="text-[11px] text-slate-500 font-medium">
                              ไม่ระบุทักษะเฉพาะ
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-2 w-36 shrink-0 ml-auto">
                          <div className="flex-1 h-2 rounded-full bg-slate-200/80 overflow-hidden">
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-[#8B5CF6] to-[#2563EB] transition-all duration-300"
                              style={{ width: `${progressPct}%` }}
                            />
                          </div>
                          <span className="text-[11px] font-extrabold text-[#6D28D9]">
                            {matchPct !== null ? `${matchPct}%` : `${topSkills.length} ทักษะ`}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Card Footer */}
                    <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                      <div className="text-[15px] font-extrabold text-slate-900">
                        {salaryInfo.main}{' '}
                        {salaryInfo.unit && (
                          <span className="text-[11px] font-normal text-slate-400">
                            {salaryInfo.unit}
                          </span>
                        )}
                      </div>
                      <span className="px-3.5 py-1.5 rounded-full text-xs font-extrabold text-[#2563EB] group-hover:bg-[#DBEAFE]/70 group-hover:text-[#1D4ED8] transition-all inline-flex items-center gap-1 shrink-0">
                        <span>ดูรายละเอียด</span>
                        <span className="group-hover:translate-x-0.5 transition-transform">→</span>
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </section>

        {/* =================================================================== */}
        {/* 4. คอร์สเรียนแนะนำ (3-COL SOFT PASTEL CARDS + MODAL PREVIEW)        */}
        {/* =================================================================== */}
        <section aria-label="คอร์สเรียนแนะนำ" className="space-y-5">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-xl sm:text-[22px] font-extrabold text-slate-900 tracking-tight">
                คอร์สเรียนแนะนำ{' '}
                <span className="text-slate-400 font-normal text-base sm:text-lg">
                  (Recommended courses)
                </span>
              </h2>
              <span className="px-3 py-1 rounded-full bg-slate-200/80 text-slate-600 text-xs font-bold">
                ปิดช่องว่างทักษะ (Skill Gaps)
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <div className="inline-flex items-center bg-white rounded-full p-1 border border-slate-200/80 shadow-sm text-xs font-bold">
                {(
                  [
                    { key: 'ALL', label: 'ทุกแพลตฟอร์ม' },
                    { key: 'YOUTUBE', label: 'YouTube (ฟรี)' },
                    { key: 'UDEMY', label: 'Udemy' },
                  ] as Array<{ key: QuickCourseProvider; label: string }>
                ).map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setCourseProviderFilter(tab.key)}
                    className={`px-3.5 py-1.5 rounded-full transition-all cursor-pointer whitespace-nowrap ${
                      courseProviderFilter === tab.key
                        ? 'bg-slate-900 text-white shadow-sm'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <Link
                href="/courses"
                className="px-4 py-2 rounded-full bg-white hover:bg-blue-50/60 border border-slate-200/90 hover:border-blue-200 text-xs font-bold text-[#2563EB] shadow-sm transition-all whitespace-nowrap"
              >
                ดูคลังคอร์สและวิเคราะห์ Skill Gaps (/courses) →
              </Link>
            </div>
          </div>

          {coursesLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {Array.from({ length: 3 }).map((_, idx) => (
                <div
                  key={idx}
                  className="bg-white rounded-[20px] p-5 border border-slate-200/70 h-56 animate-pulse flex flex-col justify-between"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-2xl bg-slate-200" />
                    <div className="space-y-2 flex-1">
                      <div className="h-4 bg-slate-200 rounded w-3/4" />
                      <div className="h-3 bg-slate-100 rounded w-1/2" />
                    </div>
                  </div>
                  <div className="h-10 bg-slate-100 rounded w-full" />
                  <div className="h-5 bg-slate-200 rounded w-1/3" />
                </div>
              ))}
            </div>
          ) : featuredCourses.length === 0 ? (
            <div className="bg-white rounded-[20px] p-10 border border-slate-200/70 text-center space-y-3">
              <p className="text-sm font-bold text-slate-800">ไม่พบคอร์สเรียนในแพลตฟอร์มนี้</p>
              <button
                type="button"
                onClick={() => setCourseProviderFilter('ALL')}
                className="px-4 py-2 rounded-xl bg-[#1D7AFC] text-white text-xs font-bold cursor-pointer"
              >
                แสดงทุกแพลตฟอร์ม
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {featuredCourses.map((c: any, idx: number) => {
                const isYoutube = String(c.provider || '').toUpperCase() === 'YOUTUBE' || c.isFree;
                const badgeCode = isYoutube ? 'YT' : 'UD';
                const badgePalette = isYoutube
                  ? idx % 2 === 0
                    ? 'bg-[#FCE7F3] text-[#BE185D]'
                    : 'bg-[#D1FAE5] text-[#047857]'
                  : 'bg-[#EDE9FE] text-[#6D28D9]';

                const courseSkills = (Array.isArray(c.skills) ? c.skills : [])
                  .map((cs: any) => cs?.skill?.name)
                  .filter(Boolean);
                const primarySkillLabel =
                  courseSkills.length > 0 ? courseSkills.slice(0, 2).join(' / ') : 'Tech Skill';

                const durationLabel =
                  c.duration || (c.durationHours ? `${c.durationHours} ชม.` : 'เรียนตามอัธยาศัย');

                return (
                  <div
                    key={c.id}
                    className="bg-white rounded-[20px] p-5 border border-slate-200/75 shadow-[0_4px_20px_-4px_rgba(15,23,42,0.035)] hover:border-[#2584FF]/50 hover:shadow-[0_14px_30px_-8px_rgba(37,99,235,0.12)] hover:-translate-y-1 transition-all duration-200 flex flex-col justify-between group"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-3 mb-3.5">
                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            className={`w-11 h-11 rounded-2xl flex items-center justify-center font-extrabold text-xs shrink-0 ${badgePalette}`}
                          >
                            {badgeCode}
                          </div>
                          <div className="min-w-0">
                            <h3 className="font-extrabold text-slate-900 text-[15px] leading-snug line-clamp-1 group-hover:text-[#1D4ED8] transition-colors">
                              {c.title}
                            </h3>
                            <p className="text-xs text-slate-400 truncate mt-0.5">
                              {c.source ? `${c.source} • ` : ''}
                              {isYoutube ? 'YouTube' : 'Udemy'}
                            </p>
                          </div>
                        </div>
                        {c.rating && (
                          <span className="px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 text-xs font-extrabold shrink-0">
                            ★ {Number(c.rating).toFixed(1)}
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap gap-1.5 mb-3.5">
                        <span className="px-2.5 py-1 rounded-lg bg-[#EDE9FE] text-[#6D28D9] text-[11px] font-bold">
                          {primarySkillLabel}
                        </span>
                        <span
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-bold ${
                            isYoutube
                              ? 'bg-[#DCFCE7] text-[#15803D]'
                              : 'bg-[#DBEAFE] text-[#1D4ED8]'
                          }`}
                        >
                          {isYoutube ? 'YOUTUBE (ฟรี)' : 'UDEMY'}
                        </span>
                        <span className="px-2.5 py-1 rounded-lg bg-[#FFEDD5] text-[#C2410C] text-[11px] font-bold">
                          {c.level || 'All Levels'}
                        </span>
                      </div>

                      <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed mb-5 min-h-[2.4rem]">
                        {c.description || 'คอร์สเรียนเสริมทักษะสายเทคโนโลยีสำหรับพัฒนาตนเองและปิดช่องว่างทักษะ'}
                      </p>
                    </div>

                    <div className="pt-3.5 border-t border-slate-100 flex items-center justify-between gap-2">
                      <div className="text-[14px] font-extrabold text-slate-900">
                        {durationLabel}{' '}
                        <span className="text-[11px] font-normal text-slate-400">
                          / {isYoutube ? 'เรียนฟรี' : 'คอร์สออนไลน์'}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => setSelectedCourse(c)}
                          className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-blue-50 text-slate-600 hover:text-[#2563EB] text-[11px] font-bold transition-colors cursor-pointer"
                        >
                          ดูตัวอย่าง
                        </button>
                        <a
                          href={c.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs font-bold text-[#2563EB] hover:text-blue-800 inline-flex items-center gap-0.5"
                        >
                          <span>ไปยังคอร์ส</span>
                          <span>→</span>
                        </a>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* =================================================================== */}
        {/* 5. ศูนย์สอบยืนยันทักษะ (SKILL ASSESSMENTS — 3-COL COMPACT CARDS)     */}
        {/* =================================================================== */}
        <section aria-label="ศูนย์สอบยืนยันทักษะ" className="space-y-5">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-xl sm:text-[22px] font-extrabold text-slate-900 tracking-tight">
                ศูนย์สอบยืนยันทักษะ{' '}
                <span className="text-slate-400 font-normal text-base sm:text-lg">
                  (Skill assessments)
                </span>
              </h2>
              <span className="px-3 py-1 rounded-full bg-[#DCFCE7] text-[#15803D] text-xs font-bold">
                อัปเดต Global Skill Score & เพิ่ม Match %
              </span>
            </div>

            <Link
              href="/assessments"
              className="px-4 py-2 rounded-full bg-white hover:bg-blue-50/60 border border-slate-200/90 hover:border-blue-200 text-xs font-bold text-[#2563EB] shadow-sm transition-all whitespace-nowrap self-start lg:self-auto"
            >
              ดูชุดข้อสอบและเหรียญรางวัลทั้งหมด (/assessments) →
            </Link>
          </div>

          {assessmentsLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {Array.from({ length: 3 }).map((_, idx) => (
                <div
                  key={idx}
                  className="bg-white rounded-[20px] p-5 border border-slate-200/70 h-44 animate-pulse flex flex-col justify-between"
                >
                  <div className="h-4 bg-slate-200 rounded w-1/3" />
                  <div className="h-5 bg-slate-200 rounded w-3/4" />
                  <div className="h-4 bg-slate-100 rounded w-1/2" />
                </div>
              ))}
            </div>
          ) : featuredAssessments.length === 0 ? (
            <div className="bg-white rounded-[20px] p-8 border border-slate-200/70 text-center text-xs text-slate-500">
              ยังไม่มีรายการแบบทดสอบที่เปิดให้สอบในขณะนี้
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {featuredAssessments.map((exam: any, idx: number) => {
                const examType =
                  exam.type || exam.examType || exam.assessmentRole || 'PRACTICAL_CODING';
                const isPractical = examType === 'PRACTICAL_CODING';
                const timeLimit = exam.timeLimitMinutes ?? exam.timeLimitMins ?? 30;
                const accentBorder =
                  idx % 3 === 0
                    ? 'border-l-[#1D7AFC]'
                    : idx % 3 === 1
                      ? 'border-l-[#8B5CF6]'
                      : 'border-l-[#10B981]';

                return (
                  <Link
                    href={`/assessments/${exam.id}`}
                    key={exam.id}
                    className={`bg-white rounded-[20px] p-5 border border-slate-200/75 border-l-4 ${accentBorder} shadow-[0_4px_20px_-4px_rgba(15,23,42,0.035)] hover:shadow-[0_14px_30px_-8px_rgba(37,99,235,0.12)] hover:-translate-y-1 transition-all duration-200 flex flex-col justify-between group`}
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-2.5">
                        <span
                          className={`px-2.5 py-0.5 rounded-md text-[10px] font-extrabold font-mono ${
                            isPractical
                              ? 'bg-[#DCFCE7] text-[#15803D]'
                              : 'bg-[#DBEAFE] text-[#1D4ED8]'
                          }`}
                        >
                          {examType}
                        </span>
                        <span className="text-[11px] text-slate-400 font-semibold">
                          ⏱️ {timeLimit} นาที • เกณฑ์ผ่าน {exam.passingScore ?? 70}%
                        </span>
                      </div>

                      <h3 className="text-[15px] font-extrabold text-slate-900 leading-snug mb-1 group-hover:text-[#1D4ED8] transition-colors line-clamp-1">
                        {exam.title}
                      </h3>
                      <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed mb-3.5 min-h-[2.2rem]">
                        {exam.description ||
                          'แบบทดสอบมาตรฐานกลางสำหรับยืนยันความสามารถและอัปเดตคะแนนทักษะหลัก'}
                      </p>
                    </div>

                    <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 text-xs min-w-0">
                        <span className="text-slate-400 shrink-0">วัดผลทักษะ:</span>
                        <span className="px-2 py-0.5 rounded bg-[#EDE9FE] text-[#6D28D9] font-bold text-[11px] truncate">
                          {exam.skill?.name || 'General Tech'}
                        </span>
                      </div>
                      <span className="text-xs font-bold text-[#2563EB] group-hover:translate-x-0.5 transition-transform shrink-0">
                        เริ่มทำข้อสอบ →
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </section>

        {/* =================================================================== */}
        {/* 6. DUAL-ROLE CLOSING CONVERSION BANNER (#111317 VISUAL BOOKEND)     */}
        {/* =================================================================== */}
        <section
          aria-label="เริ่มต้นใช้งาน SmartCareer"
          className="bg-[#111317] text-white rounded-[24px] p-5 sm:p-8 shadow-xl grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-center"
        >
          {/* Left 7 Cols: Candidate Path */}
          <div className="lg:col-span-7 lg:pr-6 lg:border-r border-white/10 space-y-3">
            <div className="inline-flex items-center gap-2 text-[11px] font-mono text-zinc-400 uppercase tracking-wider">
              <span className="w-2 h-2 rounded-full bg-[#2584FF] shrink-0" />
              <span>FOR TECH CANDIDATES • สำหรับผู้สมัครงานสายเทคโนโลยี</span>
            </div>
            <h3 className="text-xl sm:text-2xl font-extrabold tracking-tight leading-snug">
              พร้อมเพิ่มคะแนน Match Score และวางแผนสายอาชีพของคุณหรือยัง?
            </h3>
            <p className="text-xs text-zinc-400 leading-relaxed max-w-xl">
              เชื่อมต่อ GitHub ในหน้าโปรไฟล์ ทำข้อสอบปฏิบัติเพื่อรับเหรียญรับรองทักษะ
              และให้ระบบวิเคราะห์เส้นทางอาชีพ (Learning Plan) ส่วนบุคคลให้อัตโนมัติ
            </p>
            <div className="pt-2 flex flex-wrap items-center gap-3">
              <Link
                href="/learning-plan"
                className="px-5 py-2.5 rounded-xl bg-[#1D7AFC] hover:bg-[#1565D8] text-white text-xs font-bold transition-colors"
              >
                วิเคราะห์แผนพัฒนาทักษะ (/learning-plan) →
              </Link>
              <Link
                href="/profile"
                className="px-4 py-2.5 rounded-xl bg-white/[0.08] hover:bg-white/[0.14] border border-white/10 text-zinc-200 text-xs font-semibold transition-colors"
              >
                ไปที่โปรไฟล์ของฉัน (/profile)
              </Link>
            </div>
          </div>

          {/* Right 5 Cols: Hiring Company Path */}
          <div className="lg:col-span-5 lg:pl-2 border-t lg:border-t-0 border-white/10 pt-5 lg:pt-0 space-y-3">
            <div className="inline-flex items-center gap-2 text-[11px] font-mono text-zinc-400 uppercase tracking-wider">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              <span>FOR HIRING COMPANIES • สำหรับบริษัท</span>
            </div>
            <h4 className="text-lg font-extrabold tracking-tight text-white">
              คัดกรองนักพัฒนาจากผลสอบปฏิบัติและหลักฐานโค้ดจริง
            </h4>
            <p className="text-xs text-zinc-400 leading-relaxed">
              กำหนดน้ำหนักทักษะประจำตำแหน่งงาน สร้างชุดข้อสอบเฉพาะของบริษัท
              และดูคะแนนความเหมาะสมของผู้สมัครอย่างโปร่งใส
            </p>
            <div className="pt-2">
              <Link
                href="/company/jobs"
                className="inline-flex items-center gap-1.5 text-xs font-bold text-white hover:text-[#2584FF] border-b border-white hover:border-[#2584FF] pb-0.5 transition-colors"
              >
                <span>สำหรับบริษัทผู้รับสมัคร (/company/jobs)</span>
                <span>↗</span>
              </Link>
            </div>
          </div>
        </section>
      </div>

      {/* Course Detail Preview Modal */}
      <CourseDetailModal course={selectedCourse} onClose={() => setSelectedCourse(null)} />
    </div>
  );
}
