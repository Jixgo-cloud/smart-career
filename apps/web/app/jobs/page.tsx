'use client';

import React, { useEffect, useState, useCallback, useMemo } from 'react';
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

export default function JobsListPage() {
  const router = useRouter();
  const { user } = useAuth();

  // Maximum 15 jobs per page on /jobs (5 rows x 3 columns)
  const JOBS_PER_PAGE = 15;

  const [allJobs, setAllJobs] = useState<any[]>([]);
  const [favoriteJobs, setFavoriteJobs] = useState<any[]>([]);
  const [showFavoritesOnly, setShowFavoritesOnly] = useState<boolean>(false);
  const [jobsLoading, setJobsLoading] = useState(true);
  const [keyword, setKeyword] = useState('');
  const [sortBy, setSortBy] = useState<SortByOption>('publishedAt');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [favoritePendingIds, setFavoritePendingIds] = useState<Record<string, boolean>>({});

  // Left Sidebar Filter States
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
      const [res, favList] = await Promise.all([
        apiFetch<any>(`/jobs?${params.toString()}`),
        user?.role === 'CANDIDATE'
          ? apiFetch<any[]>('/jobs/favorites/me').catch(() => [])
          : Promise.resolve([]),
      ]);
      const favIds = new Set(
        (Array.isArray(favList) ? favList : []).map((f: any) => f.id || f.jobId),
      );
      if (Array.isArray(favList)) {
        setFavoriteJobs(favList);
      }
      const list = Array.isArray(res?.jobs)
        ? res.jobs
        : Array.isArray(res?.items)
          ? res.items
          : [];
      setAllJobs(
        list.map((job: any) => ({
          ...job,
          isFavorited: Boolean(job.isFavorited || favIds.has(job.id)),
        })),
      );
    } catch {
      setAllJobs([]);
    } finally {
      setJobsLoading(false);
    }
  }, [user?.role]);

  useEffect(() => {
    fetchJobs(sortBy);
  }, [fetchJobs, sortBy]);

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
        if (user.role === 'CANDIDATE') {
          const updatedFavs = await apiFetch<any[]>('/jobs/favorites/me').catch(() => null);
          if (Array.isArray(updatedFavs)) {
            setFavoriteJobs(updatedFavs);
          }
        }
      }
    } catch {
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
    setShowFavoritesOnly(false);
    setKeyword('');
    setCurrentPage(1);
  };

  useEffect(() => {
    setCurrentPage(1);
  }, [
    keyword,
    selectedJobTypes,
    minSalary,
    includeNegotiableSalary,
    selectedCategories,
    selectedSources,
    showFavoritesOnly,
    sortBy,
  ]);

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

  const filteredJobs = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    const sourceList = showFavoritesOnly
      ? favoriteJobs.length > 0
        ? favoriteJobs
        : allJobs.filter((j) => j.isFavorited)
      : allJobs;

    const list = sourceList.filter((job) => {
      if (showFavoritesOnly && !job.isFavorited) {
        return false;
      }

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

      if (selectedJobTypes.length === 0) return false;
      const matchesType = selectedJobTypes.some((t) => jobMatchesType(job, t));
      if (!matchesType) return false;

      if (minSalary > 0) {
        const hasSalary = job.salaryMax != null || job.salaryMin != null;
        if (!hasSalary) {
          if (!includeNegotiableSalary) return false;
        } else {
          const effectiveMax = job.salaryMax ?? job.salaryMin ?? 0;
          if (effectiveMax < minSalary) return false;
        }
      }

      if (selectedCategories.length === 0) return false;
      const hasAnySkills = Array.isArray(job.skills) && job.skills.length > 0;
      if (hasAnySkills || selectedCategories.length < SKILL_CATEGORY_GROUPS.length) {
        const matchesCat = selectedCategories.some((c) => jobMatchesCategoryGroup(job, c));
        if (!matchesCat && selectedCategories.length < SKILL_CATEGORY_GROUPS.length) {
          return false;
        }
      }

      if (selectedSources.length === 0) return false;
      const internal = isInternalJob(job);
      if (internal && !selectedSources.includes('INTERNAL')) return false;
      if (!internal && !selectedSources.includes('EXTERNAL')) return false;

      return true;
    });

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
    favoriteJobs,
    showFavoritesOnly,
    keyword,
    selectedJobTypes,
    minSalary,
    includeNegotiableSalary,
    selectedCategories,
    selectedSources,
    sortBy,
  ]);

  const favoritedCount = useMemo(
    () => allJobs.filter((j) => j.isFavorited).length || favoriteJobs.length,
    [allJobs, favoriteJobs],
  );

  const totalPages = Math.max(1, Math.ceil(filteredJobs.length / JOBS_PER_PAGE));
  const safePage = Math.min(currentPage, totalPages);
  const paginatedJobs = useMemo(() => {
    const start = (safePage - 1) * JOBS_PER_PAGE;
    return filteredJobs.slice(start, start + JOBS_PER_PAGE);
  }, [filteredJobs, safePage]);

  const salarySliderPct = Math.min(100, Math.max(0, Math.round((minSalary / 120000) * 100)));

  return (
    <div className="space-y-6">
      {/* SECTION HEADER: Preserved Title & Subtitle + Real Keyword Search + Real SortBy Dropdown */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold text-zinc-900 tracking-tight">
              ค้นหาตำแหน่งงานสายเทคโนโลยี
            </h1>
            <span className="px-2.5 py-0.5 rounded-full bg-zinc-200/80 text-zinc-700 text-xs font-semibold">
              แสดง {paginatedJobs.length} จาก {filteredJobs.length} ตำแหน่ง (หน้า {safePage}/
              {totalPages})
            </span>
          </div>
          <p className="text-sm text-zinc-600">
            แสดงคะแนนความเหมาะสม (Match Score) พร้อมระดับความครอบคลุมของการสอบประเมิน (Assessment
            Coverage)
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Saved Jobs Toggle (GET /jobs/favorites/me) */}
          {user?.role === 'CANDIDATE' && (
            <div className="inline-flex rounded-full bg-zinc-200/70 p-1 text-xs font-semibold">
              <button
                type="button"
                onClick={() => setShowFavoritesOnly(false)}
                className={`px-3.5 py-1.5 rounded-full transition ${
                  !showFavoritesOnly
                    ? 'bg-zinc-900 text-white shadow-sm'
                    : 'text-zinc-600 hover:text-zinc-900'
                }`}
              >
                งานทั้งหมด ({allJobs.length})
              </button>
              <button
                type="button"
                onClick={() => setShowFavoritesOnly(true)}
                className={`px-3.5 py-1.5 rounded-full transition flex items-center gap-1.5 ${
                  showFavoritesOnly
                    ? 'bg-rose-600 text-white shadow-sm'
                    : 'text-zinc-600 hover:text-rose-600'
                }`}
              >
                <span>♥</span>
                <span>งานโปรดของฉัน ({favoritedCount})</span>
              </button>
            </div>
          )}

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

        {/* RIGHT 3-COLUMN JOB CARDS GRID (9 Cols — Max 15 Jobs Per Page) */}
        <div className="lg:col-span-9">
          {jobsLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
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

                  const coverageVal =
                    job.matchAssessment?.assessmentCoverage !== undefined
                      ? Math.round(Number(job.matchAssessment.assessmentCoverage))
                      : job.match?.assessmentCoverage !== undefined
                        ? Math.round(Number(job.match.assessmentCoverage))
                        : null;

                  const primarySkill =
                    Array.isArray(job.skills) && job.skills[0]?.skill?.name
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

                        {/* 3 Pastel Pill Badges: 1. Match or Primary Skill, 2. JobType, 3. Source */}
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

              {/* Pagination Bar (Max 15 jobs per page) */}
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
  );
}
