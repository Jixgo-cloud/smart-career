'use client';

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { CourseDetailModal } from '@/components/CourseDetailModal';

export default function CoursesAndRecommendationsPage() {
  const { user } = useAuth();
  const [courses, setCourses] = useState<any[]>([]);
  const [availableSkills, setAvailableSkills] = useState<Array<{ id: string; name: string }>>([]);
  const [skillGaps, setSkillGaps] = useState<any>(null);
  const [targetRole, setTargetRole] = useState('Full-Stack Developer');
  const [search, setSearch] = useState('');
  const [providerFilter, setProviderFilter] = useState<string>('');
  const [skillIdFilter, setSkillIdFilter] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [selectedCourse, setSelectedCourse] = useState<any | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set('search', search.trim());
      if (providerFilter) params.set('provider', providerFilter);
      if (skillIdFilter) params.set('skillId', skillIdFilter);
      const courseRes = await apiFetch<any[]>(`/recommendations/courses?${params.toString()}`);
      const list = courseRes || [];
      setCourses(list);

      // Extract distinct skills for the skill filter dropdown when unfiltered by skillId
      if (!skillIdFilter && list.length > 0) {
        const skillMap = new Map<string, string>();
        for (const c of list) {
          for (const cs of c.skills || []) {
            const sid = cs.skillId || cs.skill?.id;
            const sname = cs.skill?.name;
            if (sid && sname) skillMap.set(sid, sname);
          }
        }
        setAvailableSkills(
          Array.from(skillMap.entries())
            .map(([id, name]) => ({ id, name }))
            .sort((a, b) => a.name.localeCompare(b.name)),
        );
      }

      if (user?.role === 'CANDIDATE') {
        const gaps = await apiFetch<any>(
          `/recommendations/skill-gaps?targetRole=${encodeURIComponent(targetRole)}`
        ).catch(() => null);
        setSkillGaps(gaps);
      }
    } finally {
      setLoading(false);
    }
  }, [search, providerFilter, skillIdFilter, targetRole, user]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">
          คลังคอร์สเรียนและคำแนะนำปิดช่องว่างทักษะ (Skill Gaps & Courses)
        </h1>
      </div>

      {/* Personalized Skill Gap Analysis */}
      {skillGaps && (
        <div className="card space-y-6 border-blue-200 bg-blue-50/30">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-slate-900">
                วิเคราะห์เส้นทางสู่อาชีพเป้าหมาย: {skillGaps.targetCareer}
              </h2>
              <p className="text-xs text-slate-600">
                เทียบทักษะที่ตลาดงานสายนี้ต้องการสูงสุด กับทักษะที่ตรวจพบใน GitHub และผลสอบของคุณ
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto">
              <input
                type="text"
                className="input w-full sm:w-64"
                value={targetRole}
                onChange={(e) => setTargetRole(e.target.value)}
                placeholder="เช่น Backend Engineer"
              />
              <button onClick={loadData} className="btn-primary text-xs shrink-0">
                วิเคราะห์ใหม่
              </button>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-4">
              {/* Missing skills from GitHub -> Immediate Course Recommendations */}
              <div className="space-y-2.5">
                <h3 className="font-bold text-sm text-amber-800">
                  ทักษะที่ยังขาดเทียบกับสายอาชีพนี้ ({skillGaps.gaps?.length || 0})
                </h3>
                {(skillGaps.gaps || []).length === 0 ? (
                  <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 font-medium">
                    🎉 คุณมีทักษะหลักครบทุกตัวตามที่สายอาชีพ {skillGaps.targetCareer} ต้องการใน GitHub แล้ว!
                  </div>
                ) : (
                  (skillGaps.gaps || []).map((g: any) => (
                    <div
                      key={g.skillId}
                      className="p-3 rounded-lg bg-amber-50/60 border border-amber-200 text-xs space-y-2"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <span className="font-bold text-slate-900">{g.skillName}</span>
                          {g.category && (
                            <span className="ml-2 text-slate-500">({g.category})</span>
                          )}
                        </div>
                        <span className="badge bg-amber-100 text-amber-800">
                          ยังไม่มีใน GitHub • ตลาดต้องการ ({g.totalJobDemand || 1} งาน)
                        </span>
                      </div>
                      {Array.isArray(g.recommendedCourses) &&
                        g.recommendedCourses.length > 0 && (
                          <div className="flex flex-wrap items-center gap-1.5 pt-1.5 border-t border-amber-200/70">
                            <span className="text-[11px] font-semibold text-amber-900">
                              📚 คอร์สแนะนำเพื่อเพิ่มทักษะนี้:
                            </span>
                            {g.recommendedCourses.map((rc: any) => (
                              <button
                                key={rc.id}
                                type="button"
                                onClick={() => setSelectedCourse(rc)}
                                className="px-2.5 py-1 rounded-md bg-white border border-blue-200 text-blue-700 hover:bg-blue-50 text-[11px] font-semibold transition-colors shadow-sm"
                              >
                                {rc.title} ({rc.provider})
                              </button>
                            ))}
                          </div>
                        )}
                    </div>
                  ))
                )}
              </div>

              {/* Skills already present in GitHub */}
              {Array.isArray(skillGaps.matchedSkills) && skillGaps.matchedSkills.length > 0 && (
                <div className="space-y-2 pt-3 border-t border-slate-100">
                  <h3 className="font-bold text-sm text-emerald-800">
                    ทักษะที่คุณมีในโปรไฟล์แล้ว ({skillGaps.matchedSkills.length})
                  </h3>
                  <div className="space-y-1.5">
                    {skillGaps.matchedSkills.map((m: any) => (
                      <div
                        key={m.skillId}
                        className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-xs flex flex-wrap items-center justify-between gap-2"
                      >
                        <div>
                          <span className="font-bold text-slate-900">{m.skillName}</span>
                          {m.category && (
                            <span className="ml-1.5 text-slate-500">({m.category})</span>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          {m.hasGithubEvidence && (
                            <span className="badge bg-indigo-50 text-indigo-700 border border-indigo-200/70">
                              ✓ พบใน GitHub ({m.githubRepoCount || 1} โปรเจกต์)
                            </span>
                          )}
                          {m.examScore !== null && m.examScore !== undefined && (
                            <span className="badge bg-emerald-100 text-emerald-800">
                              คะแนนสอบเสริม {m.examScore}%
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-3">
              <div>
                <h3 className="font-bold text-sm text-slate-800">
                  ข้อสอบปฏิบัติเสริมเพื่อเพิ่มความน่าเชื่อถือ (Optional Practical Exams)
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  การสอบปฏิบัติเป็นทางเลือกเสริมเพื่อให้บริษัทเห็นคะแนนความสามารถเชิงลึกของคุณนอกเหนือจาก GitHub
                </p>
              </div>
              <div className="space-y-2">
                {(skillGaps.assessmentPlan || []).map((p: any) => {
                  const examId = p.assessmentId || p.availableAssessment?.id;
                  const examTitle =
                    p.title ||
                    p.availableAssessment?.title ||
                    `แบบทดสอบมาตรฐาน ${p.skillName}`;
                  return (
                    <div
                      key={p.skillId || examId}
                      className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-xs gap-3"
                    >
                      <div className="space-y-1">
                        <div className="font-semibold text-slate-900">{examTitle}</div>
                        <div className="text-slate-500">
                          ทักษะ: <b>{p.skillName}</b>
                        </div>
                        {p.hasGithubEvidence ? (
                          <div className="text-[11px] font-semibold text-indigo-700">
                            ✓ พบใน GitHub ของคุณแล้ว ({p.githubRepoCount || 1} โปรเจกต์) — สอบเพิ่มเพื่อรับป้ายคะแนนเสริม
                          </div>
                        ) : (
                          <div className="text-[11px] font-medium text-amber-700">
                            ยังไม่มีใน GitHub — แนะนำให้เรียนคอร์สหรือเข้าสอบเพื่อยืนยันทักษะ
                          </div>
                        )}
                      </div>
                      {examId ? (
                        <Link
                          href={`/assessments/${examId}`}
                          className="text-blue-600 font-bold hover:underline shrink-0"
                        >
                          ไปสอบเสริม →
                        </Link>
                      ) : (
                        <Link
                          href="/assessments"
                          className="text-blue-600 font-bold hover:underline shrink-0"
                        >
                          ดูข้อสอบ →
                        </Link>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Course Catalog */}
      <div className="space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <h2 className="text-lg font-bold text-slate-900">คอร์สเรียนคัดสรรตามทักษะ (Curated Courses)</h2>
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Provider Filter (YOUTUBE / UDEMY) */}
            <div className="inline-flex flex-wrap rounded-xl bg-slate-100 p-1 text-xs font-semibold max-w-full">
              {[
                { key: '', label: 'ทุกแพลตฟอร์ม' },
                { key: 'YOUTUBE', label: 'YouTube (ฟรี)' },
                { key: 'UDEMY', label: 'Udemy' },
              ].map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setProviderFilter(opt.key)}
                  className={`px-3 py-1.5 rounded-lg transition ${
                    providerFilter === opt.key
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {/* Skill Filter (skillId) */}
            <select
              value={skillIdFilter}
              onChange={(e) => setSkillIdFilter(e.target.value)}
              className="input w-full sm:w-auto sm:max-w-[220px] text-xs"
              aria-label="กรองตามทักษะ"
            >
              <option value="">ทักษะทั้งหมด ({availableSkills.length})</option>
              {availableSkills.map((sk) => (
                <option key={sk.id} value={sk.id}>
                  {sk.name}
                </option>
              ))}
            </select>

            <input
              type="text"
              className="input w-full sm:max-w-xs"
              placeholder="ค้นหาชื่อคอร์ส หรือทักษะ..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {loading ? (
          <div className="p-10 text-center text-slate-500">กำลังโหลดรายการคอร์สเรียน...</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6">
            {courses.map((c: any) => (
              <div key={c.id} className="card flex flex-col justify-between space-y-4">
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <span className="badge bg-blue-50 text-blue-700">{c.provider}</span>
                      {c.rating && (
                        <span className="badge bg-amber-50 text-amber-700">
                          ★ {Number(c.rating).toFixed(1)}
                        </span>
                      )}
                    </div>
                    <span className="badge bg-slate-100 text-slate-700">
                      {c.level || 'All Levels'}
                    </span>
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 leading-snug">{c.title}</h3>
                    {c.source && (
                      <p className="text-[11px] font-medium text-slate-500 mt-0.5">
                        ผู้สอน / ช่อง: {c.source}
                      </p>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <p className="text-xs text-slate-600 whitespace-pre-line leading-relaxed line-clamp-4">
                      {c.description}
                    </p>
                    <button
                      type="button"
                      onClick={() => setSelectedCourse(c)}
                      className="text-xs font-semibold text-blue-600 hover:text-blue-800 hover:underline inline-flex items-center gap-1"
                    >
                      อ่านรายละเอียดเพิ่มเติม
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1 pt-1">
                    {(c.skills || []).map((cs: any) => (
                      <span
                        key={cs.id || cs.skillId}
                        className="badge bg-indigo-50 text-indigo-700"
                      >
                        {cs.skill?.name}
                        {cs.evidenceSource ? ` (${cs.evidenceSource})` : ''}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs gap-2">
                  <span className="text-slate-500">
                    {c.provider === 'YOUTUBE' || c.isFree
                      ? 'เรียนฟรี (YouTube)'
                      : 'คอร์สออนไลน์ (Udemy)'}{' '}
                    • {c.duration || (c.durationHours ? `${c.durationHours} ชม.` : 'เรียนตามอัธยาศัย')}
                  </span>
                  <div className="flex items-center gap-3 shrink-0">
                    <button
                      type="button"
                      onClick={() => setSelectedCourse(c)}
                      className="text-slate-600 font-medium hover:text-slate-900 hover:underline"
                    >
                      ดูเต็ม
                    </button>
                    <a
                      href={c.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 font-semibold hover:underline"
                    >
                      ไปยังคอร์สเรียน ↗
                    </a>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <CourseDetailModal
        course={selectedCourse}
        onClose={() => setSelectedCourse(null)}
      />
    </div>
  );
}
