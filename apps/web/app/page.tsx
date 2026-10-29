'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { CompanyLogo, resolveJobLogoUrl } from '@/components/CompanyLogo';

type JobTypeOption = 'FULL_TIME' | 'REMOTE' | 'PART_TIME' | 'CONTRACT' | 'INTERNSHIP';
type SkillCategoryGroup = 'BACKEND_DB' | 'FRONTEND_MOBILE' | 'AI_DATA' | 'DEVOPS_QA';
type JobSourceGroup = 'INTERNAL' | 'EXTERNAL';
type SortByOption = 'publishedAt' | 'salary' | 'matchScore';

const JOB_TYPE_OPTIONS: Array<{ key: JobTypeOption; label: string }> = [
  { key: 'FULL_TIME', label: 'Full-Time (งานประจำ)' },
  { key: 'REMOTE', label: 'Remote (ทำงานทางไกล)' },
  { key: 'PART_TIME', label: 'Part-Time (พาร์ทไทม์)' },
  { key: 'CONTRACT', label: 'Contract (สัญญาจ้าง)' },
  { key: 'INTERNSHIP', label: 'Internship (ฝึกงาน)' },
];

const SKILL_CATEGORY_GROUPS: Array<{
  key: SkillCategoryGroup;
  label: string;
  categories: string[];
  fallbackKeywords: string[];
}> = [
  {
    key: 'BACKEND_DB',
    label: 'BACKEND & DATABASE',
    categories: ['BACKEND', 'DATABASE'],
    fallbackKeywords: ['backend', 'node', 'nestjs', 'java', 'go', 'sql', 'postgres', 'database', 'api'],
  },
  {
    key: 'FRONTEND_MOBILE',
    label: 'FRONTEND & MOBILE',
    categories: ['FRONTEND', 'MOBILE'],
    fallbackKeywords: ['frontend', 'react', 'next', 'vue', 'mobile', 'ios', 'android', 'flutter', 'ui'],
  },
  {
    key: 'AI_DATA',
    label: 'AI_ML & DATA',
    categories: ['AI_ML', 'DATA_ENGINEERING'],
    fallbackKeywords: ['ai', 'ml', 'data', 'python', 'machine learning', 'analytics', 'etl'],
  },
  {
    key: 'DEVOPS_QA',
    label: 'DEVOPS & TESTING',
    categories: ['DEVOPS', 'TESTING', 'CLOUD', 'SECURITY', 'SOFT_SKILL', 'OTHER'],
    fallbackKeywords: ['devops', 'cloud', 'aws', 'docker', 'kubernetes', 'qa', 'test', 'security', 'sre'],
  },
];

const AVATAR_PALETTES = [
  'bg-blue-50 text-[#1D7AFC] border-blue-100',
  'bg-rose-50 text-rose-600 border-rose-100',
  'bg-emerald-50 text-emerald-600 border-emerald-100',
  'bg-purple-50 text-purple-600 border-purple-100',
  'bg-amber-50 text-amber-600 border-amber-100',
  'bg-cyan-50 text-cyan-600 border-cyan-100',
];

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
    const fmt = min >= 1000 && min % 1000 === 0 ? `฿${(min / 1000).toFixed(0)}k+` : `฿${min.toLocaleString()}+`;
    return { main: fmt, unit: '/เดือน' };
  }
  if (max) {
    const fmt = max >= 1000 && max % 1000 === 0 ? `สูงสุด ฿${(max / 1000).toFixed(0)}k` : `สูงสุด ฿${max.toLocaleString()}`;
    return { main: fmt, unit: '/เดือน' };
  }
  return { main: 'เงินเดือนตามตกลง', unit: '' };
}

function jobMatchesType(job: any, type: JobTypeOption): boolean {
  const empType = job.employmentType || job.jobType || 'FULL_TIME';
  if (type === 'REMOTE') {
    return empType === 'REMOTE' || Boolean(job.isRemote);
  }
  return empType === type;
}

function jobMatchesCategoryGroup(job: any, groupKey: SkillCategoryGroup): boolean {
  const group = SKILL_CATEGORY_GROUPS.find((g) => g.key === groupKey);
  if (!group) return false;

  const jobSkills: any[] = Array.isArray(job.skills) ? job.skills : [];
  const categories = jobSkills
    .map((js) => js?.skill?.category)
    .filter((c): c is string => Boolean(c));

  if (categories.some((c) => group.categories.includes(c))) {
    return true;
  }

  // Fallback if job skills have no explicit category populated
  if (categories.length === 0) {
    const haystack = `${job.title || ''} ${jobSkills.map((js) => js?.skill?.name || '').join(' ')}`.toLowerCase();
    return group.fallbackKeywords.some((kw) => haystack.includes(kw));
  }

  return false;
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

  // 2. Jobs Data & Real Interactive Filter State
  const JOBS_PER_PAGE = 9;
  const [allJobs, setAllJobs] = useState<any[]>([]);
  const [jobsLoading, setJobsLoading] = useState(true);
  const [keyword, setKeyword] = useState('');
  const [sortBy, setSortBy] = useState<SortByOption>('publishedAt');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [favoritePendingIds, setFavoritePendingIds] = useState<Record<string, boolean>>({});

  // Left Sidebar Filter States (all enabled by default so initial view shows full catalog with real counts)
  const [selectedJobTypes, setSelectedJobTypes] = useState<JobTypeOption[]>([
    'FULL_TIME',
    'REMOTE',
    'PART_TIME',
    'CONTRACT',
    'INTERNSHIP',
  ]);
  const [minSalary, setMinSalary] = useState<number>(0);
  const [includeNegotiableSalary, setIncludeNegotiableSalary] = useState<boolean>(true);
  const [selectedCategories, setSelectedCategories] = useState<SkillCategoryGroup[]>([
    'BACKEND_DB',
    'FRONTEND_MOBILE',
    'AI_DATA',
    'DEVOPS_QA',
  ]);
  const [selectedSources, setSelectedSources] = useState<JobSourceGroup[]>([
    'INTERNAL',
    'EXTERNAL',
  ]);

  const fetchJobs = useCallback(async (currentSort: SortByOption) => {
    setJobsLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('limit', '100');
      params.set('sortBy', currentSort);
      const res = await apiFetch<any>(`/jobs?${params.toString()}`);
      const list = Array.isArray(res?.jobs)
        ? res.jobs
        : Array.isArray(res?.items)
          ? res.items
          : [];
      setAllJobs(list);
    } catch {
      setAllJobs([]);
    } finally {
      setJobsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchJobs(sortBy);
  }, [fetchJobs, sortBy]);

  const analyzeGithub = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanInput = githubUsername
      .trim()
      .replace(/^https?:\/\/(www\.)?github\.com\//i, '')
      .replace(/^@/, '')
      .split('/')[0]
      .trim();

    if (!cleanInput) return;
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

  const handleToggleFavorite = async (e: React.MouseEvent, jobId: string) => {
    e.preventDefault();
    e.stopPropagation();

    if (!user) {
      router.push('/login');
      return;
    }

    if (favoritePendingIds[jobId]) return;

    setFavoritePendingIds((prev) => ({ ...prev, [jobId]: true }));
    // Optimistic update
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
      // Revert on error
      setAllJobs((prev) =>
        prev.map((j) => (j.id === jobId ? { ...j, isFavorited: !j.isFavorited } : j)),
      );
    } finally {
      setFavoritePendingIds((prev) => ({ ...prev, [jobId]: false }));
    }
  };

  const toggleJobType = (type: JobTypeOption) => {
    setSelectedJobTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type],
    );
  };

  const toggleCategoryGroup = (group: SkillCategoryGroup) => {
    setSelectedCategories((prev) =>
      prev.includes(group) ? prev.filter((g) => g !== group) : [...prev, group],
    );
  };

  const toggleSourceGroup = (src: JobSourceGroup) => {
    setSelectedSources((prev) =>
      prev.includes(src) ? prev.filter((s) => s !== src) : [...prev, src],
    );
  };

  const resetAllFilters = () => {
    setSelectedJobTypes(['FULL_TIME', 'REMOTE', 'PART_TIME', 'CONTRACT', 'INTERNSHIP']);
    setMinSalary(0);
    setIncludeNegotiableSalary(true);
    setSelectedCategories(['BACKEND_DB', 'FRONTEND_MOBILE', 'AI_DATA', 'DEVOPS_QA']);
    setSelectedSources(['INTERNAL', 'EXTERNAL']);
    setKeyword('');
    setCurrentPage(1);
  };

  // Reset to page 1 whenever any filter, search keyword, or sort changes
  useEffect(() => {
    setCurrentPage(1);
  }, [
    keyword,
    selectedJobTypes,
    minSalary,
    includeNegotiableSalary,
    selectedCategories,
    selectedSources,
    sortBy,
  ]);

  // Live filter counts computed from allJobs
  const filterCounts = useMemo(() => {
    const jobTypes: Record<JobTypeOption, number> = {
      FULL_TIME: 0,
      REMOTE: 0,
      PART_TIME: 0,
      CONTRACT: 0,
      INTERNSHIP: 0,
    };
    const categories: Record<SkillCategoryGroup, number> = {
      BACKEND_DB: 0,
      FRONTEND_MOBILE: 0,
      AI_DATA: 0,
      DEVOPS_QA: 0,
    };
    const sources: Record<JobSourceGroup, number> = {
      INTERNAL: 0,
      EXTERNAL: 0,
    };

    for (const job of allJobs) {
      for (const opt of JOB_TYPE_OPTIONS) {
        if (jobMatchesType(job, opt.key)) {
          jobTypes[opt.key] += 1;
        }
      }
      for (const grp of SKILL_CATEGORY_GROUPS) {
        if (jobMatchesCategoryGroup(job, grp.key)) {
          categories[grp.key] += 1;
        }
      }
      if (isInternalJob(job)) {
        sources.INTERNAL += 1;
      } else {
        sources.EXTERNAL += 1;
      }
    }

    return { jobTypes, categories, sources };
  }, [allJobs]);

  // Filtered & sorted jobs
  const filteredJobs = useMemo(() => {
    const kw = keyword.trim().toLowerCase();

    const list = allJobs.filter((job) => {
      // 1. Keyword filter
      if (kw) {
        const companyName = getCompanyDisplayName(job).toLowerCase();
        const title = (job.title || '').toLowerCase();
        const desc = (job.description || '').toLowerCase();
        const loc = (job.location || '').toLowerCase();
        const skillNames = (Array.isArray(job.skills) ? job.skills : [])
          .map((js: any) => (js?.skill?.name || '').toLowerCase())
          .join(' ');
        if (
          !title.includes(kw) &&
          !companyName.includes(kw) &&
          !desc.includes(kw) &&
          !loc.includes(kw) &&
          !skillNames.includes(kw)
        ) {
          return false;
        }
      }

      // 2. JobType filter
      if (selectedJobTypes.length === 0) return false;
      const matchesType = selectedJobTypes.some((t) => jobMatchesType(job, t));
      if (!matchesType) return false;

      // 3. Minimum Salary filter
      if (minSalary > 0) {
        const hasSalary = job.salaryMax != null || job.salaryMin != null;
        if (!hasSalary) {
          if (!includeNegotiableSalary) return false;
        } else {
          const effectiveMax = job.salaryMax ?? job.salaryMin ?? 0;
          if (effectiveMax < minSalary) return false;
        }
      }

      // 4. Skill Category filter
      if (selectedCategories.length === 0) return false;
      const hasAnySkills = Array.isArray(job.skills) && job.skills.length > 0;
      if (hasAnySkills || selectedCategories.length < SKILL_CATEGORY_GROUPS.length) {
        const matchesCat = selectedCategories.some((c) => jobMatchesCategoryGroup(job, c));
        if (!matchesCat && selectedCategories.length < SKILL_CATEGORY_GROUPS.length) {
          return false;
        }
      }

      // 5. JobSource filter
      if (selectedSources.length === 0) return false;
      const internal = isInternalJob(job);
      if (internal && !selectedSources.includes('INTERNAL')) return false;
      if (!internal && !selectedSources.includes('EXTERNAL')) return false;

      return true;
    });

    // Client-side sort guarantee
    return [...list].sort((a, b) => {
      if (sortBy === 'salary') {
        const salA = a.salaryMax ?? a.salaryMin ?? -1;
        const salB = b.salaryMax ?? b.salaryMin ?? -1;
        return salB - salA;
      }
      if (sortBy === 'matchScore') {
        const scoreA = a.matchScore ?? a.match?.overallScore ?? -1;
        const scoreB = b.matchScore ?? b.match?.overallScore ?? -1;
        return scoreB - scoreA;
      }
      const dateA = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
      const dateB = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
      return dateB - dateA;
    });
  }, [
    allJobs,
    keyword,
    selectedJobTypes,
    minSalary,
    includeNegotiableSalary,
    selectedCategories,
    selectedSources,
    sortBy,
  ]);

  const totalPages = Math.max(1, Math.ceil(filteredJobs.length / JOBS_PER_PAGE));
  const safePage = Math.min(currentPage, totalPages);
  const paginatedJobs = useMemo(() => {
    const start = (safePage - 1) * JOBS_PER_PAGE;
    return filteredJobs.slice(start, start + JOBS_PER_PAGE);
  }, [filteredJobs, safePage]);

  // Normalize GitHub public analysis result (supports both NestJS API shape and legacy shape)
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
    if (Array.isArray(githubResult.detectedLanguages) && githubResult.detectedLanguages.length > 0) {
      skills = githubResult.detectedLanguages.map((l: any) => ({
        skillName: l.name || String(l),
        repoCount: Number(l.repoCount ?? 1),
      }));
    } else if (Array.isArray(githubResult.detectedSkills) && githubResult.detectedSkills.length > 0) {
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
      detectedTools: Array.isArray(r.detectedTools) && r.detectedTools.length > 0
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

  const salarySliderPct = Math.min(100, Math.max(0, Math.round((minSalary / 120000) * 100)));

  return (
    <div className="min-h-screen bg-[#F2F4F8]">
      {/* TOP DARK HERO SECTION (#111317) */}
      <section className="bg-[#111317] text-white pt-6 pb-11 relative overflow-hidden">
        <div className="max-w-[1360px] mx-auto px-4 sm:px-6 lg:px-10 relative">
          {/* Subtle Ambient Glow Behind GitHub Emblem */}
          <div className="hidden lg:block absolute right-14 top-0 w-64 h-64 rounded-full bg-blue-500/15 blur-3xl pointer-events-none" />

          {/* Hero Top Row: Headline on Left + Prominent Unobscured GitHub Emblem on Right */}
          <div className="flex items-center justify-between gap-6 mb-7 relative z-10">
            <div className="flex items-center gap-3.5 max-w-3xl">
              <h1 className="text-2xl sm:text-3xl md:text-[40px] font-bold tracking-tight text-white leading-tight">
                วิเคราะห์บริบท GitHub Repository สาธารณะ
              </h1>
              <svg
                className="w-7 h-7 md:w-8 md:h-8 text-white shrink-0"
                viewBox="0 0 36 36"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M18 0C18.8 11.5 24.5 17.2 36 18C24.5 18.8 18.8 24.5 18 36C17.2 24.5 11.5 18.8 0 18C11.5 17.2 17.2 11.5 18 0Z" />
              </svg>
            </div>

            {/* Large Official GitHub Octocat Emblem on Right (Unobscured, no badge) */}
            <div className="hidden sm:flex items-center justify-center shrink-0 mr-2 lg:mr-10">
              <div className="w-24 h-24 md:w-28 md:h-28 rounded-full bg-gradient-to-b from-zinc-800/90 to-zinc-900/70 border border-white/15 flex items-center justify-center shadow-2xl ring-4 ring-white/[0.03]">
                <svg
                  className="w-16 h-16 md:w-20 md:h-20 text-white drop-shadow-[0_4px_20px_rgba(255,255,255,0.18)]"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  aria-hidden="true"
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

          {/* GIANT WHITE PILL BAR: GITHUB CONTEXT ANALYZER FORM */}
          <form
            onSubmit={analyzeGithub}
            className="bg-white rounded-2xl md:rounded-full p-2.5 md:pl-7 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-2 md:gap-0 shadow-2xl relative z-10"
          >
            <div className="flex items-center gap-3 flex-1 py-1.5 px-2 md:px-0">
              <svg
                className="w-5 h-5 text-zinc-800 shrink-0"
                viewBox="0 0 24 24"
                fill="currentColor"
                aria-hidden="true"
              >
                <path
                  fillRule="evenodd"
                  clipRule="evenodd"
                  d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
                />
              </svg>
              <span className="text-sm font-mono-code text-zinc-400 shrink-0 select-none">
                github.com/
              </span>
              <input
                type="text"
                value={githubUsername}
                onChange={(e) => setGithubUsername(e.target.value)}
                placeholder="กรอกชื่อผู้ใช้ GitHub เช่น octocat หรือ candidate-demo (ไม่ต้องล็อกอิน)..."
                className="w-full bg-transparent text-sm font-medium text-zinc-900 placeholder:text-zinc-400 focus:outline-none"
                aria-label="GitHub Username"
              />
            </div>

            {normalizedGithub && (
              <>
                <div className="hidden md:block h-8 w-px bg-zinc-200 mx-4" />

                <div className="flex items-center justify-between md:justify-end gap-3 px-2 md:px-3 py-1">
                  <span className="px-3 py-1 rounded-full bg-[#E3F9ED] text-[#14804A] text-xs font-semibold">
                    ✓ วิเคราะห์สำเร็จ ({normalizedGithub.repoCount} Public Repos)
                  </span>
                </div>
              </>
            )}

            <button
              type="submit"
              disabled={githubLoading || !githubUsername.trim()}
              className="px-8 py-3.5 rounded-xl md:rounded-full bg-[#1D7AFC] hover:bg-blue-600 disabled:opacity-60 text-white font-semibold text-sm transition shadow-md shadow-blue-500/20 shrink-0"
            >
              {githubLoading ? 'กำลังวิเคราะห์...' : 'วิเคราะห์ GitHub'}
            </button>
          </form>

          {githubError && (
            <div className="mt-4 p-3.5 rounded-2xl bg-rose-500/15 border border-rose-400/30 text-rose-200 text-xs font-medium flex items-center justify-between">
              <span>{githubError}</span>
              <button
                type="button"
                onClick={() => setGithubError('')}
                className="text-rose-200 hover:text-white font-bold ml-4"
              >
                ✕
              </button>
            </div>
          )}
        </div>
      </section>

      {/* MAIN CONTENT AREA (#F2F4F8) */}
      <div className="max-w-[1360px] mx-auto px-4 sm:px-6 lg:px-10 py-8 space-y-6">
        {/* EXPANDED GITHUB CONTEXT RESULT DRAWER (When githubResult is active) */}
        {normalizedGithub && (
          <section className="bg-white rounded-[20px] p-6 shadow-sm border border-blue-200/80 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-100 pb-3.5">
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="font-bold text-base text-zinc-900">
                  ผลวิเคราะห์ของ @{normalizedGithub.username} ({normalizedGithub.repoCount}{' '}
                  repositories)
                </h2>
                <span className="px-3 py-0.5 rounded-full bg-[#FFF0E5] text-[#D95D14] text-xs font-semibold">
                  scoreContribution: {normalizedGithub.scoreContribution} (หลักฐานบริบทเท่านั้น)
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setGithubResult(null);
                  setGithubError('');
                }}
                className="text-xs text-zinc-500 font-semibold hover:text-zinc-900 transition"
              >
                ล้างผลลัพธ์ ✕
              </button>
            </div>

            <p className="text-xs text-amber-700 font-medium">{normalizedGithub.policyNote}</p>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Left 5 Cols: Detected Languages + Frameworks */}
              <div className="lg:col-span-5 space-y-3">
                <div className="space-y-2">
                  <h3 className="text-xs font-bold text-zinc-600">
                    ภาษาโปรแกรมที่ตรวจพบในโปรเจกต์ ({normalizedGithub.skills.length})
                  </h3>
                  {normalizedGithub.skills.length === 0 ? (
                    <div className="bg-[#F8FAFC] p-4 rounded-xl border border-zinc-100 text-xs text-zinc-500">
                      ไม่พบข้อมูลภาษาโปรแกรมใน Repository สาธารณะของผู้ใช้นี้
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {normalizedGithub.skills.map((s) => (
                        <div
                          key={s.skillName}
                          className="bg-[#F8FAFC] p-3 rounded-xl border border-zinc-100 flex items-center justify-between gap-2 text-xs"
                        >
                          <span className="font-bold text-zinc-900">{s.skillName}</span>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="px-2.5 py-0.5 rounded-full bg-[#EFE8FF] text-[#6B38FB] font-semibold">
                              พบใน {s.repoCount} โปรเจกต์
                            </span>
                            <span className="px-2.5 py-0.5 rounded-full bg-[#E3F9ED] text-[#14804A] font-semibold">
                              Context (คะแนน = 0)
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {normalizedGithub.detectedFrameworks &&
                  normalizedGithub.detectedFrameworks.length > 0 && (
                    <div className="space-y-2 pt-1">
                      <h3 className="text-xs font-bold text-zinc-600">
                        Frameworks & Libraries ที่ตรวจพบจาก package.json ({normalizedGithub.detectedFrameworks.length})
                      </h3>
                      <div className="bg-[#F8FAFC] p-3 rounded-xl border border-zinc-100 flex flex-wrap gap-1.5">
                        {normalizedGithub.detectedFrameworks.map((fw) => (
                          <span
                            key={fw.name}
                            className="px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200/60 text-xs font-semibold"
                          >
                            {fw.name} ({fw.repoCount} {fw.repoCount > 1 ? 'repos' : 'repo'})
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
              </div>

              {/* Right 7 Cols: Recent Public Repositories */}
              <div className="lg:col-span-7 space-y-2">
                <h3 className="text-xs font-bold text-zinc-600">Repositories ล่าสุด (repos)</h3>
                {normalizedGithub.repos.length === 0 ? (
                  <div className="bg-[#F8FAFC] p-4 rounded-xl border border-zinc-100 text-xs text-zinc-500">
                    ไม่พบ Public Repository
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    {normalizedGithub.repos.slice(0, 6).map((r: any) => (
                      <div
                        key={r.name}
                        className="bg-[#F8FAFC] p-3.5 rounded-xl border border-zinc-100 space-y-1.5 flex flex-col justify-between"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center justify-between gap-2 text-xs">
                            <a
                              href={r.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="font-bold text-[#1D7AFC] hover:underline truncate"
                            >
                              {r.name}
                            </a>
                            <span className="text-zinc-500 shrink-0">★ {r.stars}</span>
                          </div>
                          {r.description && (
                            <p className="text-[11px] text-zinc-500 line-clamp-2">
                              {r.description}
                            </p>
                          )}
                        </div>
                        {r.detectedTools && r.detectedTools.length > 0 && (
                          <div className="flex flex-wrap gap-1 pt-1 text-[10px] font-semibold">
                            {r.detectedTools.slice(0, 4).map((tool: string, idx: number) => {
                              const pillClasses =
                                idx % 3 === 0
                                  ? 'bg-[#EFE8FF] text-[#6B38FB]'
                                  : idx % 3 === 1
                                    ? 'bg-[#E3F9ED] text-[#14804A]'
                                    : 'bg-[#FFF0E5] text-[#D95D14]';
                              return (
                                <span
                                  key={tool}
                                  className={`px-2 py-0.5 rounded-full ${pillClasses}`}
                                >
                                  {tool}
                                </span>
                              );
                            })}
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

        {/* SECTION HEADER: Recommended jobs + Real Keyword Search + Real SortBy Dropdown */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-2xl font-bold text-zinc-900 tracking-tight">
              ตำแหน่งงานแนะนำ{' '}
              <span className="text-zinc-400 font-normal text-lg ml-1">(Recommended jobs)</span>
            </h2>
            <span className="px-2.5 py-0.5 rounded-full bg-zinc-200/80 text-zinc-700 text-xs font-semibold">
              แสดง {paginatedJobs.length} จาก {filteredJobs.length} ตำแหน่ง (หน้า {safePage}/{totalPages})
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Real Keyword Search Input */}
            <div className="bg-white border border-zinc-200/90 rounded-full px-4 py-2 flex items-center gap-2 text-xs text-zinc-700 w-full sm:w-64 shadow-sm focus-within:border-[#1D7AFC] focus-within:ring-2 focus-within:ring-blue-500/15 transition">
              <svg
                className="w-3.5 h-3.5 text-zinc-400 shrink-0"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                viewBox="0 0 24 24"
              >
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                type="text"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="ค้นหาตำแหน่ง, บริษัท หรือทักษะ..."
                className="w-full bg-transparent text-xs text-zinc-800 placeholder:text-zinc-400 focus:outline-none"
                aria-label="ค้นหาตำแหน่งงาน"
              />
              {keyword && (
                <button
                  type="button"
                  onClick={() => setKeyword('')}
                  className="text-zinc-400 hover:text-zinc-700 font-bold"
                  aria-label="ล้างคำค้นหา"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Real SortBy Selector */}
            <div className="px-4 py-2 rounded-full bg-white border border-zinc-300 text-xs font-semibold text-zinc-800 flex items-center gap-1.5 shadow-sm">
              <span className="text-zinc-400">เรียงตาม:</span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortByOption)}
                className="bg-transparent font-semibold text-zinc-800 focus:outline-none cursor-pointer"
                aria-label="เรียงตาม"
              >
                <option value="publishedAt">ล่าสุด (publishedAt)</option>
                <option value="salary">เงินเดือนสูงสุด (salary)</option>
                <option value="matchScore">คะแนนความเหมาะสม (matchScore)</option>
              </select>
            </div>
          </div>
        </div>

        {/* 2-COLUMN LAYOUT: Left Sidebar Filters (3 Cols) + Right 3-Col Job Cards Grid (9 Cols) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* LEFT SIDEBAR FILTERS (100% Real-System Connected) */}
          <aside className="lg:col-span-3 space-y-6 lg:pr-2">
            {/* Filter Group 1: JobType Enum */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-zinc-900">รูปแบบงาน (JobType)</span>
                <button
                  type="button"
                  onClick={resetAllFilters}
                  className="text-xs font-semibold text-rose-500 hover:text-rose-600 transition"
                >
                  ล้างค่า (Clear all)
                </button>
              </div>
              <div className="space-y-2 text-xs font-medium text-zinc-700">
                {JOB_TYPE_OPTIONS.map((opt) => {
                  const checked = selectedJobTypes.includes(opt.key);
                  return (
                    <label
                      key={opt.key}
                      className="flex items-center justify-between cursor-pointer select-none group"
                    >
                      <div className="flex items-center gap-2.5">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleJobType(opt.key)}
                          className="sr-only"
                        />
                        <span
                          className={`w-4 h-4 rounded flex items-center justify-center text-[10px] transition ${
                            checked
                              ? 'bg-zinc-900 text-white'
                              : 'border border-zinc-400 bg-transparent group-hover:border-zinc-600'
                          }`}
                        >
                          {checked ? '✓' : ''}
                        </span>
                        <span className={checked ? 'text-zinc-800' : 'text-zinc-500'}>
                          {opt.label}
                        </span>
                      </div>
                      <span className="text-zinc-400 font-mono-code">
                        {filterCounts.jobTypes[opt.key]}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Filter Group 2: Real Minimum Salary Slider */}
            <div className="space-y-3 pt-4 border-t border-zinc-200/70">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-zinc-900">เงินเดือนขั้นต่ำ (Salary)</span>
                <span className="text-xs font-bold text-[#1D7AFC] font-mono-code">
                  {minSalary > 0 ? `≥ ฿${minSalary.toLocaleString()}` : '฿0 (ทั้งหมด)'}
                </span>
              </div>

              <div className="pt-1">
                <div className="relative h-1.5 bg-zinc-300 rounded-full">
                  <div
                    className="absolute left-0 top-0 h-1.5 bg-zinc-900 rounded-full pointer-events-none"
                    style={{ width: `${salarySliderPct}%` }}
                  />
                  <input
                    type="range"
                    min={0}
                    max={120000}
                    step={5000}
                    value={minSalary}
                    onChange={(e) => setMinSalary(Number(e.target.value))}
                    className="w-full h-1.5 bg-transparent appearance-none cursor-pointer relative z-10 accent-zinc-900"
                    aria-label="เงินเดือนขั้นต่ำ"
                  />
                </div>
                <div className="flex justify-between text-[11px] font-semibold text-zinc-500 mt-2.5">
                  <button
                    type="button"
                    onClick={() => setMinSalary(0)}
                    className="hover:text-zinc-900 transition"
                  >
                    ฿0 (ทั้งหมด)
                  </button>
                  <button
                    type="button"
                    onClick={() => setMinSalary(60000)}
                    className="hover:text-zinc-900 transition"
                  >
                    ฿60k
                  </button>
                  <button
                    type="button"
                    onClick={() => setMinSalary(120000)}
                    className="hover:text-zinc-900 transition"
                  >
                    ฿120k+
                  </button>
                </div>
              </div>

              <label className="flex items-center gap-2 text-[11px] font-medium text-zinc-600 pt-0.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={includeNegotiableSalary}
                  onChange={(e) => setIncludeNegotiableSalary(e.target.checked)}
                  className="sr-only"
                />
                <span
                  className={`w-3.5 h-3.5 rounded flex items-center justify-center text-[9px] transition ${
                    includeNegotiableSalary
                      ? 'bg-zinc-900 text-white'
                      : 'border border-zinc-400 bg-transparent'
                  }`}
                >
                  {includeNegotiableSalary ? '✓' : ''}
                </span>
                <span>รวมงานที่ “เงินเดือนตามตกลง”</span>
              </label>
            </div>

            {/* Filter Group 3: Real SkillCategory Enum */}
            <div className="space-y-3 pt-4 border-t border-zinc-200/70">
              <span className="text-sm font-bold text-zinc-900 block">
                หมวดทักษะ (Skill Category)
              </span>
              <div className="space-y-2 text-xs font-medium text-zinc-700">
                {SKILL_CATEGORY_GROUPS.map((grp) => {
                  const checked = selectedCategories.includes(grp.key);
                  return (
                    <label
                      key={grp.key}
                      className="flex items-center justify-between cursor-pointer select-none group"
                    >
                      <div className="flex items-center gap-2.5">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleCategoryGroup(grp.key)}
                          className="sr-only"
                        />
                        <span
                          className={`w-4 h-4 rounded flex items-center justify-center text-[10px] transition ${
                            checked
                              ? 'bg-zinc-900 text-white'
                              : 'border border-zinc-400 bg-transparent group-hover:border-zinc-600'
                          }`}
                        >
                          {checked ? '✓' : ''}
                        </span>
                        <span className={checked ? 'text-zinc-800' : 'text-zinc-500'}>
                          {grp.label}
                        </span>
                      </div>
                      <span className="text-zinc-400 font-mono-code">
                        {filterCounts.categories[grp.key]}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Filter Group 4: Real JobSource */}
            <div className="space-y-2.5 pt-4 border-t border-zinc-200/70">
              <span className="text-sm font-bold text-zinc-900 block">ประเภทประกาศ (Source)</span>
              <div className="space-y-2 text-xs font-medium text-zinc-700">
                <label className="flex items-center justify-between cursor-pointer select-none group">
                  <div className="flex items-center gap-2.5">
                    <input
                      type="checkbox"
                      checked={selectedSources.includes('INTERNAL')}
                      onChange={() => toggleSourceGroup('INTERNAL')}
                      className="sr-only"
                    />
                    <span
                      className={`w-4 h-4 rounded flex items-center justify-center text-[10px] transition ${
                        selectedSources.includes('INTERNAL')
                          ? 'bg-zinc-900 text-white'
                          : 'border border-zinc-400 bg-transparent group-hover:border-zinc-600'
                      }`}
                    >
                      {selectedSources.includes('INTERNAL') ? '✓' : ''}
                    </span>
                    <span
                      className={
                        selectedSources.includes('INTERNAL') ? 'text-zinc-800' : 'text-zinc-500'
                      }
                    >
                      รับสมัครตรง (INTERNAL)
                    </span>
                  </div>
                  <span className="text-zinc-400 font-mono-code">
                    {filterCounts.sources.INTERNAL}
                  </span>
                </label>

                <label className="flex items-center justify-between cursor-pointer select-none group">
                  <div className="flex items-center gap-2.5">
                    <input
                      type="checkbox"
                      checked={selectedSources.includes('EXTERNAL')}
                      onChange={() => toggleSourceGroup('EXTERNAL')}
                      className="sr-only"
                    />
                    <span
                      className={`w-4 h-4 rounded flex items-center justify-center text-[10px] transition ${
                        selectedSources.includes('EXTERNAL')
                          ? 'bg-zinc-900 text-white'
                          : 'border border-zinc-400 bg-transparent group-hover:border-zinc-600'
                      }`}
                    >
                      {selectedSources.includes('EXTERNAL') ? '✓' : ''}
                    </span>
                    <span
                      className={
                        selectedSources.includes('EXTERNAL') ? 'text-zinc-800' : 'text-zinc-500'
                      }
                    >
                      ลิงก์ภายนอก (External)
                    </span>
                  </div>
                  <span className="text-zinc-400 font-mono-code">
                    {filterCounts.sources.EXTERNAL}
                  </span>
                </label>
              </div>
            </div>
          </aside>

          {/* RIGHT 3-COLUMN JOB CARDS GRID (9 Cols) */}
          <div className="lg:col-span-9">
            {jobsLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                {[1, 2, 3, 4, 5, 6].map((n) => (
                  <div
                    key={n}
                    className="bg-white rounded-[20px] p-5 border border-slate-200/60 h-56 animate-pulse flex flex-col justify-between"
                  >
                    <div className="space-y-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-slate-200" />
                        <div className="space-y-1.5 flex-1">
                          <div className="h-3.5 bg-slate-200 rounded w-3/4" />
                          <div className="h-2.5 bg-slate-100 rounded w-1/2" />
                        </div>
                      </div>
                      <div className="flex gap-1.5">
                        <div className="h-5 w-16 bg-slate-100 rounded-full" />
                        <div className="h-5 w-16 bg-slate-100 rounded-full" />
                        <div className="h-5 w-16 bg-slate-100 rounded-full" />
                      </div>
                      <div className="h-8 bg-slate-100 rounded" />
                    </div>
                    <div className="h-4 bg-slate-100 rounded w-full" />
                  </div>
                ))}
              </div>
            ) : filteredJobs.length === 0 ? (
              <div className="bg-white rounded-[20px] p-12 text-center border border-slate-200/70 space-y-3">
                <p className="text-sm font-semibold text-zinc-700">
                  ไม่พบตำแหน่งงานที่ตรงกับตัวกรองที่เลือก
                </p>
                <p className="text-xs text-zinc-500">
                  ลองปรับลดเงินเดือนขั้นต่ำ หรือกดปุ่มล้างค่าตัวกรองเพื่อดูตำแหน่งงานทั้งหมด
                </p>
                <button
                  type="button"
                  onClick={resetAllFilters}
                  className="px-5 py-2 rounded-full bg-[#1D7AFC] text-white text-xs font-semibold hover:bg-blue-600 transition"
                >
                  ล้างตัวกรองทั้งหมด
                </button>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                  {paginatedJobs.map((job) => {
                    const companyName = getCompanyDisplayName(job);
                    const initials = getCompanyInitials(companyName);
                    const avatarPalette = getAvatarPalette(companyName);
                    const salaryInfo = formatCompactSalary(job.salaryMin, job.salaryMax);
                    const empType = job.employmentType || job.jobType || 'FULL_TIME';
                    const internal = isInternalJob(job);

                    const matchVal =
                      job.matchScore !== null && job.matchScore !== undefined
                        ? Math.round(Number(job.matchScore))
                        : job.match?.overallScore !== undefined
                          ? Math.round(Number(job.match.overallScore))
                          : null;

                    const primarySkill = Array.isArray(job.skills) && job.skills[0]?.skill?.name
                      ? `ทักษะหลัก: ${job.skills[0].skill.name}`
                      : 'ทักษะมาตรฐาน';

                    return (
                      <Link
                        key={job.id}
                        href={`/jobs/${job.id}`}
                        className="bg-white rounded-[20px] p-5 border border-slate-200/60 shadow-[0_4px_20px_-4px_rgba(15,23,42,0.04)] hover:border-blue-400/80 hover:shadow-md transition flex flex-col justify-between space-y-4 group"
                      >
                        <div className="space-y-3.5">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-3 min-w-0">
                              <CompanyLogo
                                logoUrl={resolveJobLogoUrl(job)}
                                companyName={companyName}
                                size="md"
                              />
                              <div className="min-w-0">
                                <h3 className="font-bold text-sm text-zinc-900 group-hover:text-[#1D7AFC] transition truncate">
                                  {job.title}
                                </h3>
                                <p className="text-[11px] text-zinc-400 truncate">
                                  {companyName} • {job.location || 'กรุงเทพฯ'}
                                </p>
                              </div>
                            </div>

                            {/* Real Favorite Toggle Button (POST /jobs/:id/favorite) */}
                            <button
                              type="button"
                              onClick={(e) => handleToggleFavorite(e, job.id)}
                              className={`p-1 rounded-full transition shrink-0 ${
                                job.isFavorited
                                  ? 'text-rose-500 hover:text-rose-600'
                                  : 'text-zinc-300 hover:text-rose-400'
                              }`}
                              title={job.isFavorited ? 'ลบออกจากงานโปรด' : 'บันทึกงานโปรด'}
                              aria-label="บันทึกงานโปรด"
                            >
                              <svg
                                className="w-4 h-4 fill-current"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                                strokeWidth={job.isFavorited ? '0' : '2'}
                              >
                                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                              </svg>
                            </button>
                          </div>

                          {/* 3 Pastel Pill Badges: 1. Match/Primary Skill, 2. JobType, 3. Source */}
                          <div className="flex flex-wrap gap-1.5 text-[11px] font-semibold">
                            <span className="px-2.5 py-1 rounded-full bg-[#EFE8FF] text-[#6B38FB]">
                              {matchVal !== null ? `Match ${matchVal}%` : primarySkill}
                            </span>
                            <span className="px-2.5 py-1 rounded-full bg-[#E3F9ED] text-[#14804A]">
                              {job.isRemote && empType !== 'REMOTE' ? 'REMOTE' : empType}
                            </span>
                            <span className="px-2.5 py-1 rounded-full bg-[#FFF0E5] text-[#D95D14]">
                              {internal ? 'รับสมัครตรง' : `External (${job.source || 'Partner'})`}
                            </span>
                          </div>

                          <p className="text-xs text-zinc-600 leading-relaxed line-clamp-2">
                            {(job.description || '')
                              .replace(
                                /^(?:job\s+description|description|responsibilities|about\s+(?:us|the\s+role)|รายละเอียดงาน|หน้าที่ความรับผิดชอบ)\s*[:：]?\s*/i,
                                '',
                              )
                              .replace(/\s*\n+\s*/g, ' ')
                              .trim() ||
                              `ตำแหน่งงาน ${job.title} ที่ ${companyName} ประเมินความเหมาะสมด้วยผลสอบมาตรฐาน`}
                          </p>
                        </div>

                        <div className="pt-3.5 border-t border-zinc-100 flex items-center justify-between">
                          <div>
                            <span className="font-extrabold text-sm text-zinc-900">
                              {salaryInfo.main}
                            </span>
                            {salaryInfo.unit && (
                              <span className="text-[11px] text-zinc-400">{salaryInfo.unit}</span>
                            )}
                          </div>
                          <span className="text-[11px] text-[#1D7AFC] font-semibold group-hover:translate-x-0.5 transition-transform">
                            ดูรายละเอียด →
                          </span>
                        </div>
                      </Link>
                    );
                  })}
                </div>

                {/* Pagination Bar (Max 9 jobs per page) */}
                <div className="bg-white rounded-[20px] px-5 py-3.5 border border-slate-200/70 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-3">
                  <span className="text-xs text-zinc-500 font-medium">
                    แสดงรายการที่ {(safePage - 1) * JOBS_PER_PAGE + 1} -{' '}
                    {Math.min(safePage * JOBS_PER_PAGE, filteredJobs.length)} จากทั้งหมด{' '}
                    <span className="font-bold text-zinc-800">{filteredJobs.length}</span> ตำแหน่ง
                    (สูงสุด {JOBS_PER_PAGE} งานต่อหน้า)
                  </span>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={safePage <= 1}
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      className="px-4 py-2 rounded-full border border-zinc-200 bg-white text-xs font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-40 disabled:pointer-events-none transition"
                    >
                      ← หน้าก่อนหน้า
                    </button>

                    <div className="flex items-center gap-1">
                      {Array.from({ length: totalPages }, (_, idx) => idx + 1).map((pageNum) => (
                        <button
                          key={pageNum}
                          type="button"
                          onClick={() => setCurrentPage(pageNum)}
                          className={`w-8 h-8 rounded-full text-xs font-bold transition ${
                            pageNum === safePage
                              ? 'bg-zinc-900 text-white shadow-sm'
                              : 'text-zinc-600 hover:bg-zinc-100'
                          }`}
                        >
                          {pageNum}
                        </button>
                      ))}
                    </div>

                    <button
                      type="button"
                      disabled={safePage >= totalPages}
                      onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                      className="px-4 py-2 rounded-full bg-[#1D7AFC] text-white text-xs font-semibold hover:bg-blue-600 disabled:opacity-40 disabled:pointer-events-none transition shadow-sm"
                    >
                      ดูหน้าถัดไป →
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
