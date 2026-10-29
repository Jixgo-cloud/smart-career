'use client';

import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';

interface DesiredRoleOption {
  key: string;
  value: string;
  labelTh: string;
  categories: string[];
  stackHint: string;
  badgeBg: string;
  badgeText: string;
  aliases?: string[];
}

const DESIRED_ROLE_OPTIONS: DesiredRoleOption[] = [
  {
    key: 'FRONTEND',
    value: 'Frontend Developer',
    labelTh: 'นักพัฒนา Frontend',
    categories: ['FRONTEND'],
    stackHint: 'React, Next.js, TypeScript, Tailwind CSS',
    badgeBg: 'bg-indigo-50 border-indigo-200/80',
    badgeText: 'text-indigo-600',
    aliases: ['front-end developer', 'ui developer', 'web developer', 'frontend'],
  },
  {
    key: 'BACKEND',
    value: 'Backend Developer',
    labelTh: 'นักพัฒนา Backend',
    categories: ['BACKEND'],
    stackHint: 'Node.js, NestJS, Go, Java, REST / GraphQL API',
    badgeBg: 'bg-emerald-50 border-emerald-200/80',
    badgeText: 'text-emerald-600',
    aliases: ['back-end developer', 'backend engineer', 'api developer', 'backend'],
  },
  {
    key: 'DATABASE',
    value: 'Database Engineer / DBA',
    labelTh: 'วิศวกรฐานข้อมูล (Database / DBA)',
    categories: ['DATABASE'],
    stackHint: 'PostgreSQL, MySQL, MongoDB, Redis, SQL Optimization',
    badgeBg: 'bg-amber-50 border-amber-200/80',
    badgeText: 'text-amber-600',
    aliases: ['database engineer', 'database administrator', 'dba', 'data engineer', 'database'],
  },
  {
    key: 'DEVOPS',
    value: 'DevOps Engineer',
    labelTh: 'วิศวกรระบบ DevOps และคลาวด์',
    categories: ['DEVOPS'],
    stackHint: 'Docker, Kubernetes, AWS, Azure, CI/CD Pipeline',
    badgeBg: 'bg-sky-50 border-sky-200/80',
    badgeText: 'text-sky-600',
    aliases: ['devops / cloud engineer', 'cloud engineer', 'site reliability engineer', 'sre', 'devops'],
  },
  {
    key: 'TESTING',
    value: 'QA / Test Engineer',
    labelTh: 'วิศวกรทดสอบซอฟต์แวร์ (QA Automation)',
    categories: ['TESTING'],
    stackHint: 'Playwright, Cypress, Selenium, Automated Testing',
    badgeBg: 'bg-teal-50 border-teal-200/80',
    badgeText: 'text-teal-600',
    aliases: ['qa engineer', 'test engineer', 'software tester', 'sdet', 'testing'],
  },
];

function findRoleOption(roleValue: string): DesiredRoleOption | null {
  const clean = (roleValue || '').trim().toLowerCase();
  if (!clean) return null;
  const normalized = clean.replace(/[-_]/g, ' ').replace(/\s+/g, ' ');
  return (
    DESIRED_ROLE_OPTIONS.find((opt) => {
      const optLower = opt.value.toLowerCase();
      const optNorm = optLower.replace(/[-_]/g, ' ').replace(/\s+/g, ' ');
      return (
        opt.key.toLowerCase() === clean ||
        optLower === clean ||
        optNorm === normalized ||
        opt.labelTh.toLowerCase() === clean ||
        (opt.aliases || []).some((a) => a.toLowerCase() === clean || a.replace(/[-_]/g, ' ') === normalized)
      );
    }) || null
  );
}

function RoleTrackIcon({ roleKey, className = 'w-5 h-5' }: { roleKey: string; className?: string }) {
  switch (roleKey) {
    case 'FRONTEND':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="2" y="3" width="20" height="14" rx="2" />
          <line x1="8" y1="21" x2="16" y2="21" />
          <line x1="12" y1="17" x2="12" y2="21" />
        </svg>
      );
    case 'BACKEND':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="2" y="2" width="20" height="8" rx="2" ry="2" />
          <rect x="2" y="14" width="20" height="8" rx="2" ry="2" />
          <line x1="6" y1="6" x2="6.01" y2="6" />
          <line x1="6" y1="18" x2="6.01" y2="18" />
        </svg>
      );
    case 'DATABASE':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <ellipse cx="12" cy="5" rx="9" ry="3" />
          <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
          <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
        </svg>
      );
    case 'DEVOPS':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" />
        </svg>
      );
    case 'TESTING':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M9 11l3 3L22 4" />
          <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
        </svg>
      );
    default:
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
          <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
        </svg>
      );
  }
}

function polarToCartesian(cx: number, cy: number, angleDeg: number, radius: number) {
  const rad = (angleDeg * Math.PI) / 180;
  return {
    x: cx + radius * Math.cos(rad),
    y: cy + radius * Math.sin(rad),
  };
}

function buildRoundedPolygonPath(
  points: Array<{ x: number; y: number }>,
  cornerRadius = 15,
): string {
  const n = points.length;
  if (n < 3) return '';
  let path = '';

  for (let i = 0; i < n; i++) {
    const prev = points[(i - 1 + n) % n];
    const curr = points[i];
    const next = points[(i + 1) % n];

    const v1 = { x: prev.x - curr.x, y: prev.y - curr.y };
    const v2 = { x: next.x - curr.x, y: next.y - curr.y };
    const len1 = Math.hypot(v1.x, v1.y) || 1;
    const len2 = Math.hypot(v2.x, v2.y) || 1;

    const r = Math.min(cornerRadius, len1 * 0.35, len2 * 0.35);
    const p1 = { x: curr.x + (v1.x / len1) * r, y: curr.y + (v1.y / len1) * r };
    const p2 = { x: curr.x + (v2.x / len2) * r, y: curr.y + (v2.y / len2) * r };

    if (i === 0) {
      path += `M ${p1.x.toFixed(1)} ${p1.y.toFixed(1)} `;
    } else {
      path += `L ${p1.x.toFixed(1)} ${p1.y.toFixed(1)} `;
    }
    path += `Q ${curr.x.toFixed(1)} ${curr.y.toFixed(1)} ${p2.x.toFixed(1)} ${p2.y.toFixed(1)} `;
  }
  path += 'Z';
  return path;
}

export default function CandidateProfilePage() {
  const [profile, setProfile] = useState<any>(null);
  const [skillsData, setSkillsData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  // Form states
  const [fullName, setFullName] = useState('');
  const [bio, setBio] = useState('');
  const [education, setEducation] = useState('');
  const [experienceYears, setExperienceYears] = useState(0);
  const [desiredRole, setDesiredRole] = useState('');
  const [location, setLocation] = useState('');
  const [phone, setPhone] = useState('');
  const [portfolioUrl, setPortfolioUrl] = useState('');
  const [githubUsername, setGithubUsername] = useState('');
  const [isPublic, setIsPublic] = useState(true);
  const [skillFilter, setSkillFilter] = useState<'ALL' | 'EVIDENCE_OR_ASSESSED' | 'NOT_ASSESSED'>('ALL');

  // Desired Role UI/UX Pro Max Dropdown states (5 Radar Categories)
  const [roleDropdownOpen, setRoleDropdownOpen] = useState(false);
  const [roleSearchQuery, setRoleSearchQuery] = useState('');
  const roleDropdownRef = useRef<HTMLDivElement | null>(null);
  const roleSearchInputRef = useRef<HTMLInputElement | null>(null);

  const selectedRoleOption = useMemo(() => findRoleOption(desiredRole), [desiredRole]);

  const filteredRoleOptions = useMemo(() => {
    const q = roleSearchQuery.trim().toLowerCase();
    if (!q) return DESIRED_ROLE_OPTIONS;
    return DESIRED_ROLE_OPTIONS.filter(
      (opt) =>
        opt.value.toLowerCase().includes(q) ||
        opt.labelTh.toLowerCase().includes(q) ||
        opt.stackHint.toLowerCase().includes(q) ||
        opt.categories.some((c) => c.toLowerCase().includes(q)) ||
        (opt.aliases || []).some((a) => a.toLowerCase().includes(q)),
    );
  }, [roleSearchQuery]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (roleDropdownRef.current && !roleDropdownRef.current.contains(event.target as Node)) {
        setRoleDropdownOpen(false);
      }
    };
    if (roleDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      setTimeout(() => roleSearchInputRef.current?.focus(), 30);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [roleDropdownOpen]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [prof, sk] = await Promise.all([
        apiFetch<any>('/candidate/profile'),
        apiFetch<any>('/candidate/skills'),
      ]);
      setProfile(prof);
      setSkillsData(sk);
      setFullName(prof.fullName || '');
      setBio(prof.bio || '');
      setEducation(
        prof.educationText ??
          (typeof prof.education === 'string'
            ? prof.education
            : Array.isArray(prof.education) && prof.education[0]
              ? [prof.education[0].degree, prof.education[0].institution]
                  .filter(Boolean)
                  .join(' - ')
              : ''),
      );
      setExperienceYears(prof.experienceYears || 0);
      setDesiredRole(prof.desiredRole || prof.targetCareer || '');
      setLocation(prof.location || '');
      setPhone(prof.phone || '');
      setPortfolioUrl(prof.portfolioUrl || '');
      setGithubUsername(prof.githubUsername || '');
      setIsPublic(prof.isPublic ?? true);
    } catch (err: any) {
      setError(err.message || 'ไม่สามารถดึงข้อมูลโปรไฟล์ผู้สมัครได้');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage('');
    setError('');
    try {
      await apiFetch('/candidate/profile', {
        method: 'PUT',
        body: JSON.stringify({
          fullName,
          bio,
          education,
          experienceYears: Number(experienceYears),
          desiredRole,
          targetCareer: desiredRole,
          location,
          phone,
          portfolioUrl,
          githubUsername,
          isPublic,
        }),
      });
      setMessage('บันทึกโปรไฟล์เรียบร้อยแล้ว');
      await loadData();
    } catch (err: any) {
      setError(err.message || 'บันทึกโปรไฟล์ไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  };

  const handleSyncGithub = async () => {
    setSyncing(true);
    setMessage('');
    setError('');
    try {
      const res = await apiFetch<any>('/github/sync', {
        method: 'POST',
        body: JSON.stringify({ username: githubUsername || undefined }),
      });
      setMessage(`ซิงก์ข้อมูล GitHub (@${res.username}) สำเร็จ — บันทึกเป็นหลักฐานบริบทแล้ว`);
      await loadData();
    } catch (err: any) {
      setError(err.message || 'ซิงก์ GitHub ไม่สำเร็จ');
    } finally {
      setSyncing(false);
    }
  };

  if (loading) {
    return <div className="p-8 text-center text-slate-600">กำลังโหลดข้อมูลโปรไฟล์...</div>;
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">โปรไฟล์ผู้สมัครและผลประเมินทักษะ</h1>
          <p className="text-sm text-slate-600">
            คะแนนทักษะคำนวณจากแบบทดสอบปฏิบัติกลาง (PRACTICAL_CODING) ล่าสุดเท่านั้น • ข้อมูล GitHub ใช้เป็นหลักฐานบริบท (scoreContribution = 0)
          </p>
        </div>
        <div className="flex gap-3">
          <Link href="/assessments" className="btn-primary">
            ทำแบบทดสอบทักษะเพิ่ม
          </Link>
          <Link href="/learning-plan" className="btn-secondary">
            แผนพัฒนาทักษะ (Learning Plan)
          </Link>
        </div>
      </div>

      {message && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm">
          {message}
        </div>
      )}
      {error && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* 5-Category Radar / Skill Breakdown */}
      <div className="grid md:grid-cols-2 gap-6">
        <div className="bg-white rounded-[28px] p-6 sm:p-7 border border-slate-200/80 shadow-[0_12px_40px_-12px_rgba(15,23,42,0.08)] flex flex-col justify-between relative overflow-hidden">
          {(() => {
            const radarItems: any[] = Array.isArray(skillsData?.radar) ? skillsData.radar : [];
            const totalSkillsAll = radarItems.reduce(
              (sum, c) => sum + Number(c.totalSkillsInCategory || 0),
              0,
            );
            const totalGithubSkills = radarItems.reduce(
              (sum, c) => sum + Number(c.githubCount || 0),
              0,
            );
            const assessedCategories = radarItems.filter(
              (c) => c.status === 'ASSESSED' && c.averageScore !== null,
            );
            const overallExamAvg =
              assessedCategories.length > 0
                ? Math.round(
                    assessedCategories.reduce((s, c) => s + Number(c.averageScore || 0), 0) /
                      assessedCategories.length,
                  )
                : null;

            const cx = 215;
            const cy = 162;
            const maxR = 102;
            const gridLevels = [0.33, 0.66, 1.0];

            const labelOffsets = [
              { dx: 0, dy: -22, anchor: 'middle' as const },
              { dx: 38, dy: -4, anchor: 'start' as const },
              { dx: 34, dy: 18, anchor: 'start' as const },
              { dx: -34, dy: 18, anchor: 'end' as const },
              { dx: -38, dy: -4, anchor: 'end' as const },
            ];

            const purplePoints = radarItems.map((cat, idx) => {
              const angle = -90 + idx * 72;
              const pct = Math.max(12, Number(cat.githubCoveragePct || 0));
              return polarToCartesian(cx, cy, angle, (pct / 100) * maxR);
            });

            const orangePoints = radarItems.map((cat, idx) => {
              const angle = -90 + idx * 72;
              const isAssessed = cat.status === 'ASSESSED' && cat.averageScore !== null;
              const pct = isAssessed ? Math.max(14, Number(cat.averageScore)) : 12;
              return polarToCartesian(cx, cy, angle, (pct / 100) * maxR);
            });

            const purplePath = buildRoundedPolygonPath(purplePoints, 15);
            const orangePath = buildRoundedPolygonPath(orangePoints, 15);

            return (
              <>
                <div className="space-y-2">
                  {/* Top Header Row: Title + Big Metric + Glowing Sparkle Emblem */}
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1">
                      <div className="text-sm font-bold text-slate-800 tracking-tight">
                        เรดาร์ทักษะ 5 หมวดหลัก (Skill Radar)
                      </div>
                      <div className="text-3xl sm:text-4xl font-extrabold text-slate-950 font-mono tracking-tight">
                        {overallExamAvg !== null ? (
                          <>
                            {overallExamAvg}%{' '}
                            <span className="text-base sm:text-lg font-bold text-slate-500 font-sans">
                              คะแนนสอบเฉลี่ย • {totalGithubSkills}/{totalSkillsAll} ทักษะ GitHub
                            </span>
                          </>
                        ) : (
                          <>
                            {totalGithubSkills} / {totalSkillsAll}{' '}
                            <span className="text-base sm:text-lg font-bold text-slate-500 font-sans">
                              ทักษะที่พบใน GitHub
                            </span>
                          </>
                        )}
                      </div>
                      <p className="text-xs font-medium text-slate-400">
                        เทียบหลักฐานโปรเจกต์ GitHub ({profile?.githubSummary?.username ? `@${profile.githubSummary.username}` : 'Context'}) กับคะแนนสอบปฏิบัติจริง
                      </p>
                    </div>

                    {/* Top-Right Glowing Sparkle Emblem */}
                    <div className="relative shrink-0">
                      <div className="absolute -inset-2 rounded-full bg-[#6842FF]/20 blur-xl pointer-events-none" />
                      <div className="w-11 h-11 rounded-full bg-[#F1EEFF] border border-[#E2DAFF] flex items-center justify-center relative shadow-sm">
                        <svg
                          className="w-5 h-5 text-[#6842FF]"
                          viewBox="0 0 24 24"
                          fill="currentColor"
                          aria-hidden="true"
                        >
                          <path d="M12 2C12.7 7.6 16.4 11.3 22 12C16.4 12.7 12.7 16.4 12 22C11.3 16.4 7.6 12.7 2 12C7.6 11.3 11.3 7.6 12 2Z" />
                        </svg>
                      </div>
                    </div>
                  </div>

                  {/* Center SVG Pentagon Radar Chart */}
                  {radarItems.length > 0 && (
                    <div className="relative flex items-center justify-center my-1">
                      <svg
                        viewBox="0 0 430 310"
                        className="w-full max-w-[410px] h-auto overflow-visible select-none"
                      >
                        <defs>
                          <radialGradient id="radarPurpleGlow" cx="50%" cy="50%" r="55%">
                            <stop offset="0%" stopColor="#6842FF" stopOpacity="0.22" />
                            <stop offset="70%" stopColor="#6842FF" stopOpacity="0.08" />
                            <stop offset="100%" stopColor="#6842FF" stopOpacity="0" />
                          </radialGradient>
                          <radialGradient id="radarOrangeGlow" cx="50%" cy="50%" r="55%">
                            <stop offset="0%" stopColor="#F2541B" stopOpacity="0.20" />
                            <stop offset="70%" stopColor="#F2541B" stopOpacity="0.07" />
                            <stop offset="100%" stopColor="#F2541B" stopOpacity="0" />
                          </radialGradient>
                          <filter
                            id="radarPurpleShadow"
                            x="-25%"
                            y="-25%"
                            width="150%"
                            height="150%"
                          >
                            <feDropShadow
                              dx="0"
                              dy="6"
                              stdDeviation="8"
                              floodColor="#6842FF"
                              floodOpacity="0.28"
                            />
                          </filter>
                          <filter
                            id="radarOrangeShadow"
                            x="-25%"
                            y="-25%"
                            width="150%"
                            height="150%"
                          >
                            <feDropShadow
                              dx="0"
                              dy="6"
                              stdDeviation="8"
                              floodColor="#F2541B"
                              floodOpacity="0.25"
                            />
                          </filter>
                        </defs>

                        {/* Concentric Pentagon Grid Webs */}
                        <g stroke="#E2E8F0" strokeWidth="1" fill="none">
                          {gridLevels.map((lvl) => {
                            const pts = radarItems
                              .map((_, idx) => {
                                const p = polarToCartesian(cx, cy, -90 + idx * 72, maxR * lvl);
                                return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
                              })
                              .join(' ');
                            return <polygon key={lvl} points={pts} />;
                          })}
                        </g>

                        {/* Radial Axis Lines */}
                        <g stroke="#E2E8F0" strokeWidth="1">
                          {radarItems.map((cat, idx) => {
                            const outer = polarToCartesian(cx, cy, -90 + idx * 72, maxR);
                            return (
                              <line
                                key={cat.category}
                                x1={cx}
                                y1={cy}
                                x2={outer.x.toFixed(1)}
                                y2={outer.y.toFixed(1)}
                              />
                            );
                          })}
                        </g>

                        {/* Orange Polygon (Practical Coding Assessment Score) */}
                        <path
                          d={orangePath}
                          fill="url(#radarOrangeGlow)"
                          stroke="#F2541B"
                          strokeWidth="3.5"
                          strokeLinejoin="round"
                          strokeLinecap="round"
                          filter="url(#radarOrangeShadow)"
                        />

                        {/* Purple Polygon (GitHub Evidence Coverage) */}
                        <path
                          d={purplePath}
                          fill="url(#radarPurpleGlow)"
                          stroke="#6842FF"
                          strokeWidth="3.5"
                          strokeLinejoin="round"
                          strokeLinecap="round"
                          filter="url(#radarPurpleShadow)"
                        />

                        {/* Vertex Labels (Category Name + Dual Colored Monospace Numbers) */}
                        <g>
                          {radarItems.map((cat, idx) => {
                            const pos = polarToCartesian(cx, cy, -90 + idx * 72, maxR);
                            const off = labelOffsets[idx] || {
                              dx: 0,
                              dy: 0,
                              anchor: 'middle' as const,
                            };
                            const lx = pos.x + off.dx;
                            const ly = pos.y + off.dy;
                            const ghCount = Number(cat.githubCount || 0);
                            const totalCat = Number(cat.totalSkillsInCategory || 0);
                            const ghPct = Number(cat.githubCoveragePct || 0);
                            const isAssessed =
                              cat.status === 'ASSESSED' && cat.averageScore !== null;

                            return (
                              <g key={cat.category}>
                                <text
                                  x={lx}
                                  y={ly - 14}
                                  textAnchor={off.anchor}
                                  className="text-[11px] font-bold fill-slate-700"
                                >
                                  {cat.label} ({ghCount}/{totalCat} ทักษะ)
                                </text>
                                <text
                                  x={lx}
                                  y={ly + 2}
                                  textAnchor={off.anchor}
                                  className="text-xs font-mono font-bold"
                                >
                                  <tspan fill="#6842FF">{ghPct}%</tspan>
                                  <tspan fill="#CBD5E1"> / </tspan>
                                  <tspan fill="#F2541B">
                                    {isAssessed ? `${cat.averageScore}%` : '0%'}
                                  </tspan>
                                </text>
                              </g>
                            );
                          })}
                        </g>
                      </svg>
                    </div>
                  )}

                  {/* Compact GitHub Evidenced Skills Breakdown Pills */}
                  {totalGithubSkills > 0 && (
                    <div className="bg-slate-50/90 rounded-2xl p-3 border border-slate-100 space-y-1.5">
                      {radarItems
                        .filter((c) => Array.isArray(c.githubSkillNames) && c.githubSkillNames.length > 0)
                        .map((cat) => (
                          <div key={cat.category} className="text-[11px] leading-snug">
                            <span className="font-bold text-slate-700">{cat.label}: </span>
                            <span className="text-[#6842FF] font-medium">
                              {cat.githubSkillNames.join(', ')}
                            </span>
                          </div>
                        ))}
                    </div>
                  )}
                </div>

                {/* Bottom Legend */}
                <div className="pt-3 mt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="flex flex-wrap items-center gap-3.5">
                    <span className="inline-flex items-center gap-1.5 font-semibold text-slate-700">
                      <span className="w-2.5 h-2.5 rounded-full bg-[#6842FF] inline-block" />
                      <span className="text-[#6842FF] font-mono font-bold">สีม่วง</span> = ความครอบคลุม GitHub (%)
                    </span>
                    <span className="inline-flex items-center gap-1.5 font-semibold text-slate-700">
                      <span className="w-2.5 h-2.5 rounded-full bg-[#F2541B] inline-block" />
                      <span className="text-[#F2541B] font-mono font-bold">สีส้ม</span> = คะแนนสอบปฏิบัติ (%)
                    </span>
                  </div>
                  <span className="badge bg-slate-100 text-slate-600">
                    แยกสถานะยังไม่ประเมินชัดเจน
                  </span>
                </div>
              </>
            );
          })()}
        </div>

        {/* GitHub Sync & Evidence Box */}
        <div className="card space-y-4 flex flex-col justify-between">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900">บริบท GitHub Repository</h2>
              <span className="badge bg-amber-100 text-amber-800">Context Only (คะแนน = 0)</span>
            </div>
            <p className="text-sm text-slate-600">
              เชื่อมต่อและซิงก์ข้อมูลภาษาจาก GitHub เพื่อแสดงเป็นหลักฐานประกอบโปรไฟล์โดยไม่ปะปนกับคะแนนสอบปฏิบัติ
            </p>
            <div className="pt-2">
              <label className="label">ชื่อผู้ใช้ GitHub (GitHub Username)</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  className="input"
                  value={githubUsername}
                  onChange={(e) => setGithubUsername(e.target.value)}
                  placeholder="เช่น somchai-dev"
                />
                <button
                  type="button"
                  onClick={handleSyncGithub}
                  disabled={syncing}
                  className="btn-secondary shrink-0"
                >
                  {syncing ? 'กำลังซิงก์...' : 'Sync GitHub'}
                </button>
              </div>
            </div>
          </div>

          {profile?.githubSummary && (
            <div className="p-3.5 bg-slate-50 rounded-lg border border-slate-200 text-xs space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="font-semibold text-slate-800">
                  ซิงก์ล่าสุด: @{profile.githubSummary.username} ({profile.githubSummary.repoCount || 0}{' '}
                  repos)
                </div>
                {profile.githubLastSyncedAt && (
                  <div className="text-slate-500">
                    เวลาซิงก์: {new Date(profile.githubLastSyncedAt).toLocaleString('th-TH')}
                  </div>
                )}
              </div>

              {Array.isArray(profile.githubRepos) && profile.githubRepos.length > 0 && (
                <div className="pt-2 border-t border-slate-200/80 space-y-1.5">
                  <div className="text-[11px] font-semibold text-slate-600">
                    โปรเจกต์ที่ซิงก์จาก GitHub ({profile.githubRepos.length} repositories):
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1">
                    {profile.githubRepos.map((repo: any) => {
                      const topics: string[] = Array.isArray(repo.topics) ? repo.topics : [];
                      return (
                        <div
                          key={repo.id || repo.fullName}
                          className="p-2 bg-white rounded-lg border border-slate-200/80 space-y-1"
                        >
                          <div className="flex items-center justify-between gap-1">
                            <a
                              href={repo.url || `https://github.com/${repo.fullName}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="font-bold text-blue-600 hover:underline truncate"
                            >
                              {repo.repoName || repo.fullName}
                            </a>
                            {repo.language && (
                              <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 text-[10px] font-medium shrink-0">
                                {repo.language}
                              </span>
                            )}
                          </div>
                          {topics.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {topics.slice(0, 5).map((t) => (
                                <span
                                  key={t}
                                  className="px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 text-[10px] font-medium"
                                >
                                  {t}
                                </span>
                              ))}
                              {topics.length > 5 && (
                                <span className="text-[10px] text-slate-400">
                                  +{topics.length - 5}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Candidate Skills Table */}
      <div className="card space-y-4">
        {(() => {
          const allSkillRows: any[] = Array.isArray(skillsData?.skills) ? skillsData.skills : [];
          const sortedSkills = [...allSkillRows].sort((a, b) => {
            const aAssessed = a.status === 'ASSESSED' || a.status === 'GAP' ? 1 : 0;
            const bAssessed = b.status === 'ASSESSED' || b.status === 'GAP' ? 1 : 0;
            if (aAssessed !== bAssessed) return bAssessed - aAssessed;
            if (aAssessed && bAssessed) {
              return (b.assessedScore ?? 0) - (a.assessedScore ?? 0);
            }
            const aGh = a.hasGithubEvidence ? 1 : 0;
            const bGh = b.hasGithubEvidence ? 1 : 0;
            if (aGh !== bGh) return bGh - aGh;
            if (aGh && bGh) {
              if ((b.githubRepoCount ?? 0) !== (a.githubRepoCount ?? 0)) {
                return (b.githubRepoCount ?? 0) - (a.githubRepoCount ?? 0);
              }
            }
            return String(a.skillName || '').localeCompare(String(b.skillName || ''));
          });

          const activeOrGhCount = sortedSkills.filter(
            (s) => s.status !== 'NOT_ASSESSED' || s.hasGithubEvidence,
          ).length;
          const notAssessedNoGhCount = sortedSkills.length - activeOrGhCount;

          const visibleSkills = sortedSkills.filter((s) => {
            if (skillFilter === 'EVIDENCE_OR_ASSESSED') {
              return s.status !== 'NOT_ASSESSED' || s.hasGithubEvidence;
            }
            if (skillFilter === 'NOT_ASSESSED') {
              return s.status === 'NOT_ASSESSED' && !s.hasGithubEvidence;
            }
            return true;
          });

          return (
            <>
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold text-slate-900">
                    ตารางสถานะทักษะรายวิชา (Skill Matrix)
                  </h2>
                  <p className="text-xs text-slate-500">
                    เกณฑ์ผ่านมาตรฐาน: 60% ขึ้นไป = ASSESSED | ต่ำกว่า 60% = GAP | ทักษะที่พบใน GitHub จะแสดงลำดับต้นเพื่อให้เลือกเข้าสอบได้สะดวก
                  </p>
                </div>

                <div className="inline-flex rounded-xl bg-slate-100 p-1 text-xs font-semibold shrink-0">
                  <button
                    type="button"
                    onClick={() => setSkillFilter('ALL')}
                    className={`px-3 py-1.5 rounded-lg transition ${
                      skillFilter === 'ALL'
                        ? 'bg-white text-slate-900 shadow-sm'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    ทั้งหมด ({sortedSkills.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setSkillFilter('EVIDENCE_OR_ASSESSED')}
                    className={`px-3 py-1.5 rounded-lg transition ${
                      skillFilter === 'EVIDENCE_OR_ASSESSED'
                        ? 'bg-white text-indigo-700 shadow-sm'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    พบใน GitHub / สอบแล้ว ({activeOrGhCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => setSkillFilter('NOT_ASSESSED')}
                    className={`px-3 py-1.5 rounded-lg transition ${
                      skillFilter === 'NOT_ASSESSED'
                        ? 'bg-white text-slate-900 shadow-sm'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    อื่นๆ ที่ยังไม่ประเมิน ({notAssessedNoGhCount})
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-600">
                      <th className="py-2.5 px-3">ทักษะ (Skill)</th>
                      <th className="py-2.5 px-3">หมวดหมู่</th>
                      <th className="py-2.5 px-3">สถานะการประเมิน</th>
                      <th className="py-2.5 px-3">คะแนนสอบปฏิบัติล่าสุด</th>
                      <th className="py-2.5 px-3">ระดับความชำนาญ</th>
                      <th className="py-2.5 px-3">หลักฐานบริบทจาก GitHub</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {visibleSkills.map((item: any) => (
                      <tr key={item.skillId} className="hover:bg-slate-50">
                        <td className="py-2.5 px-3 font-semibold text-slate-900">
                          {item.skillName}
                        </td>
                        <td className="py-2.5 px-3 text-slate-600">{item.category}</td>
                        <td className="py-2.5 px-3">
                          {item.status === 'ASSESSED' && (
                            <span className="badge bg-emerald-100 text-emerald-800">
                              ประเมินแล้ว (ASSESSED)
                            </span>
                          )}
                          {item.status === 'GAP' && (
                            <span className="badge bg-amber-100 text-amber-800">
                              ควรพัฒนาเพิ่ม (GAP)
                            </span>
                          )}
                          {item.status === 'NOT_ASSESSED' && (
                            <span className="badge bg-slate-100 text-slate-600">
                              ยังไม่ประเมิน (NOT_ASSESSED)
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 font-mono font-semibold">
                          {item.assessedScore !== null && item.assessedScore !== undefined ? (
                            <span
                              className={
                                item.assessedScore >= 60 ? 'text-emerald-700' : 'text-amber-700'
                              }
                            >
                              {item.assessedScore}%
                            </span>
                          ) : (
                            <span className="text-slate-400">ยังไม่ประเมิน</span>
                          )}
                        </td>
                        <td className="py-2.5 px-3">{item.level || '-'}</td>
                        <td className="py-2.5 px-3">
                          {item.hasGithubEvidence ? (
                            <div className="space-y-1">
                              <span className="badge bg-indigo-50 text-indigo-700">
                                ✓ พบใน GitHub ({item.githubRepoCount || 1} โปรเจกต์)
                              </span>
                              {Array.isArray(item.githubRepoNames) &&
                                item.githubRepoNames.length > 0 && (
                                  <div className="text-[11px] text-slate-500">
                                    Repos: {item.githubRepoNames.join(', ')}
                                  </div>
                                )}
                            </div>
                          ) : (
                            <span className="text-xs text-slate-400">-</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          );
        })()}
      </div>

      {/* Edit Profile Form */}
      <form onSubmit={handleSaveProfile} className="card space-y-4">
        <h2 className="text-lg font-bold text-slate-900">แก้ไขข้อมูลส่วนตัว</h2>
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label className="label">ชื่อ-นามสกุล</label>
            <input
              type="text"
              className="input"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
            />
          </div>
          <div ref={roleDropdownRef} className="relative">
            <div className="flex items-center justify-between mb-1.5">
              <label htmlFor="desired-role-select" className="block text-xs font-semibold text-slate-700">
                ตำแหน่งสายงานที่ต้องการ (Desired Role)
              </label>
              <span className="text-[11px] font-medium text-slate-500">
                อ้างอิงเรดาร์ทักษะ 5 หมวดหลัก
              </span>
            </div>

            {/* Screen-reader / native form select sync */}
            <select
              id="desired-role-select"
              aria-label="ตำแหน่งสายงานที่ต้องการ (Desired Role)"
              value={selectedRoleOption ? selectedRoleOption.value : ''}
              onChange={(e) => {
                setDesiredRole(e.target.value);
              }}
              className="sr-only"
              tabIndex={-1}
            >
              <option value="">เลือกตำแหน่งสายงานที่ต้องการ</option>
              {DESIRED_ROLE_OPTIONS.map((opt) => (
                <option key={opt.key} value={opt.value}>
                  {opt.value} ({opt.labelTh})
                </option>
              ))}
            </select>

            <button
              type="button"
              aria-haspopup="listbox"
              aria-expanded={roleDropdownOpen}
              onClick={() => setRoleDropdownOpen((prev) => !prev)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setRoleDropdownOpen(false);
                if (e.key === 'ArrowDown' && !roleDropdownOpen) {
                  e.preventDefault();
                  setRoleDropdownOpen(true);
                }
              }}
              className={`cursor-pointer w-full rounded-xl border bg-white px-3.5 py-2 text-left transition-all duration-200 flex items-center justify-between gap-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30 ${
                roleDropdownOpen
                  ? 'border-[#1D7AFC] ring-2 ring-blue-500/15 shadow-sm'
                  : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50/50'
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className={`w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 transition-colors duration-200 ${
                    selectedRoleOption
                      ? `${selectedRoleOption.badgeBg} ${selectedRoleOption.badgeText}`
                      : 'bg-slate-100 border-slate-200 text-slate-600'
                  }`}
                >
                  <RoleTrackIcon
                    roleKey={selectedRoleOption?.key || 'DEFAULT'}
                    className="w-4 h-4"
                  />
                </div>
                <div className="min-w-0">
                  {selectedRoleOption ? (
                    <>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-slate-900 truncate">
                          {selectedRoleOption.value}
                        </span>
                      </div>
                      <div className="text-[11px] font-medium text-slate-600 truncate">
                        {selectedRoleOption.labelTh} • {selectedRoleOption.stackHint}
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="text-sm font-medium text-slate-500 truncate">
                        เลือกตำแหน่งสายงานที่ต้องการ (5 หมวดเรดาร์)...
                      </div>
                      <div className="text-[11px] text-slate-400 truncate">
                        FRONTEND • BACKEND • DATABASE • DEVOPS • TESTING
                      </div>
                    </>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {selectedRoleOption && (
                  <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 text-[10px] font-mono font-semibold">
                    {selectedRoleOption.categories[0]}
                  </span>
                )}
                <svg
                  className={`w-4 h-4 text-slate-500 transition-transform duration-200 ${
                    roleDropdownOpen ? 'rotate-180 text-[#1D7AFC]' : ''
                  }`}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </div>
            </button>

            {/* Dropdown Popover Panel */}
            {roleDropdownOpen && (
              <div
                role="listbox"
                aria-label="ตัวเลือกตำแหน่งสายงาน 5 หมวดเรดาร์"
                className="absolute z-40 mt-2 w-full rounded-2xl bg-white border border-slate-200/90 shadow-[0_20px_50px_-12px_rgba(15,23,42,0.18)] overflow-hidden"
              >
                {/* Search / Filter Bar inside Dropdown */}
                <div className="p-2.5 border-b border-slate-100 bg-slate-50/70">
                  <div className="relative flex items-center">
                    <svg
                      className="w-4 h-4 text-slate-400 absolute left-3 pointer-events-none"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <circle cx="11" cy="11" r="8" />
                      <line x1="21" y1="21" x2="16.65" y2="16.65" />
                    </svg>
                    <input
                      ref={roleSearchInputRef}
                      type="text"
                      value={roleSearchQuery}
                      onChange={(e) => setRoleSearchQuery(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Escape') {
                          e.stopPropagation();
                          setRoleDropdownOpen(false);
                        }
                        if (e.key === 'Enter' && filteredRoleOptions.length > 0) {
                          e.preventDefault();
                          setDesiredRole(filteredRoleOptions[0].value);
                          setRoleDropdownOpen(false);
                          setRoleSearchQuery('');
                        }
                      }}
                      placeholder="ค้นหาจาก 5 หมวดเรดาร์ (Frontend, Backend, Database, DevOps, Testing)..."
                      className="w-full rounded-xl border border-slate-200 bg-white pl-9 pr-8 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:border-[#1D7AFC] focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    />
                    {roleSearchQuery && (
                      <button
                        type="button"
                        onClick={() => setRoleSearchQuery('')}
                        className="cursor-pointer absolute right-2.5 text-slate-400 hover:text-slate-700 p-0.5"
                        aria-label="ล้างคำค้นหาสายงาน"
                      >
                        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <line x1="18" y1="6" x2="6" y2="18" />
                          <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                      </button>
                    )}
                  </div>
                </div>

                {/* Role Options List (Strictly 5 Radar Categories) */}
                <div className="max-h-72 overflow-y-auto p-1.5 divide-y divide-slate-100/60">
                  {filteredRoleOptions.length > 0 ? (
                    filteredRoleOptions.map((opt) => {
                      const isSelected = selectedRoleOption?.key === opt.key;
                      return (
                        <button
                          key={opt.key}
                          type="button"
                          role="option"
                          aria-selected={isSelected}
                          onClick={() => {
                            setDesiredRole(opt.value);
                            setRoleDropdownOpen(false);
                            setRoleSearchQuery('');
                          }}
                          className={`cursor-pointer w-full text-left p-2.5 rounded-xl transition-colors duration-150 flex items-start justify-between gap-3 ${
                            isSelected
                              ? 'bg-blue-50/80 text-slate-900'
                              : 'hover:bg-slate-50 text-slate-800'
                          }`}
                        >
                          <div className="flex items-start gap-3 min-w-0">
                            <div
                              className={`w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 mt-0.5 ${opt.badgeBg} ${opt.badgeText}`}
                            >
                              <RoleTrackIcon roleKey={opt.key} className="w-4 h-4" />
                            </div>
                            <div className="min-w-0 space-y-0.5">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-xs sm:text-sm font-bold text-slate-900">
                                  {opt.value}
                                </span>
                                <span className="text-[11px] font-semibold text-slate-600">
                                  ({opt.labelTh})
                                </span>
                              </div>
                              <p className="text-[11px] text-slate-500 truncate">
                                ทักษะเด่น: {opt.stackHint}
                              </p>
                              <div className="flex flex-wrap gap-1 pt-0.5">
                                {opt.categories.map((cat) => (
                                  <span
                                    key={cat}
                                    className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 text-[10px] font-mono font-semibold"
                                  >
                                    หมวดเรดาร์: {cat}
                                  </span>
                                ))}
                              </div>
                            </div>
                          </div>

                          <div className="shrink-0 self-center">
                            {isSelected ? (
                              <span className="w-6 h-6 rounded-full bg-[#1D7AFC] text-white flex items-center justify-center shadow-sm">
                                <svg
                                  className="w-3.5 h-3.5"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2.5"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  aria-hidden="true"
                                >
                                  <polyline points="20 6 9 17 4 12" />
                                </svg>
                              </span>
                            ) : (
                              <span className="text-[11px] font-semibold text-slate-400 px-1.5">
                                เลือก
                              </span>
                            )}
                          </div>
                        </button>
                      );
                    })
                  ) : (
                    <div className="p-4 text-center">
                      <p className="text-xs text-slate-600">
                        ไม่พบสายงานใน 5 หมวดเรดาร์ที่ตรงกับ &ldquo;{roleSearchQuery}&rdquo;
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Selected Career Track Context Bar */}
            {selectedRoleOption && (
              <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-slate-50 border border-slate-200/70 text-[11px]">
                <div className="flex flex-wrap items-center gap-1.5 text-slate-600">
                  <span className="font-semibold text-slate-700">หมวดเรดาร์ทักษะ:</span>
                  {selectedRoleOption.categories.map((cat) => (
                    <span
                      key={cat}
                      className="px-1.5 py-0.5 rounded bg-white border border-slate-200 text-slate-700 font-mono text-[10px] font-semibold"
                    >
                      {cat}
                    </span>
                  ))}
                </div>
                <Link
                  href="/courses"
                  className="cursor-pointer font-semibold text-[#1D7AFC] hover:underline inline-flex items-center gap-1"
                >
                  <span>ดูคอร์สตามสายงานนี้</span>
                  <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <line x1="5" y1="12" x2="19" y2="12" />
                    <polyline points="12 5 19 12 12 19" />
                  </svg>
                </Link>
              </div>
            )}
          </div>
          <div>
            <label className="label">ระดับการศึกษา / สถาบัน</label>
            <input
              type="text"
              className="input"
              value={education}
              onChange={(e) => setEducation(e.target.value)}
            />
          </div>
          <div>
            <label className="label">ประสบการณ์ทำงาน (ปี)</label>
            <input
              type="number"
              min={0}
              max={50}
              className="input"
              value={experienceYears}
              onChange={(e) => setExperienceYears(Number(e.target.value))}
            />
          </div>
          <div>
            <label className="label">พื้นที่ปฏิบัติงาน (Location)</label>
            <input
              type="text"
              className="input"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
            />
          </div>
          <div>
            <label className="label">เบอร์โทรศัพท์</label>
            <input
              type="text"
              className="input"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>
          <div className="md:col-span-2">
            <label className="label">ลิงก์ผลงาน (Portfolio URL)</label>
            <input
              type="url"
              className="input"
              value={portfolioUrl}
              onChange={(e) => setPortfolioUrl(e.target.value)}
              placeholder="https://..."
            />
          </div>
          <div className="md:col-span-2">
            <label className="label">แนะนำตัว (Bio)</label>
            <textarea
              rows={3}
              className="input"
              value={bio}
              onChange={(e) => setBio(e.target.value)}
            />
          </div>
        </div>
        <div className="flex items-center justify-between pt-2">
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={isPublic}
              onChange={(e) => setIsPublic(e.target.checked)}
            />
            เปิดโปรไฟล์ให้บริษัทที่ลงทะเบียนตรวจสอบได้
          </label>
          <button type="submit" disabled={saving} className="btn-primary">
            {saving ? 'กำลังบันทึก...' : 'บันทึกโปรไฟล์'}
          </button>
        </div>
      </form>
    </div>
  );
}
