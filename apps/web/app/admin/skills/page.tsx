'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { apiFetch } from '@/lib/api';
import { AdminBanner, confirmAdminAction } from '@/components/admin/ui';

const SKILL_CATEGORIES = [
  { value: 'FRONTEND', label: 'FRONTEND (ส่วนติดต่อผู้ใช้)' },
  { value: 'BACKEND', label: 'BACKEND (ระบบหลังบ้าน)' },
  { value: 'DATABASE', label: 'DATABASE (ฐานข้อมูล)' },
  { value: 'DEVOPS', label: 'DEVOPS (โครงสร้างพื้นฐาน & Cloud)' },
  { value: 'TESTING', label: 'TESTING (การทดสอบซอฟต์แวร์)' },
  { value: 'MOBILE', label: 'MOBILE (แอปพลิเคชันมือถือ)' },
  { value: 'AI_ML', label: 'AI_ML (ปัญญาประดิษฐ์ & ข้อมูล)' },
  { value: 'SECURITY', label: 'SECURITY (ความมั่นคงปลอดภัย)' },
  { value: 'SALES', label: 'SALES (งานขาย & พัฒนาธุรกิจ)' },
  { value: 'COORDINATION', label: 'COORDINATION (ประสานงาน & บริหารโครงการ)' },
  { value: 'WRITING', label: 'WRITING (งานเขียน & สื่อสารเทคนิค)' },
];

export default function AdminSkillsPage() {
  const [skills, setSkills] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [name, setName] = useState('');
  const [category, setCategory] = useState('BACKEND');
  const [description, setDescription] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const loadSkills = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch<any[]>('/admin/skills');
      setSkills(res || []);
    } catch (err: any) {
      setError(err?.message || 'ไม่สามารถโหลดรายการทักษะได้');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSkills();
  }, [loadSkills]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage('');
    setError('');
    try {
      await apiFetch('/admin/skills', {
        method: 'POST',
        body: JSON.stringify({ name, category, description }),
      });
      setMessage(`เพิ่มทักษะมาตรฐาน "${name}" เรียบร้อยแล้ว`);
      setName('');
      setDescription('');
      await loadSkills();
    } catch (err: any) {
      setError(err.message || 'ไม่สามารถสร้างทักษะได้');
    }
  };

  const handleDelete = async (sk: any) => {
    const confirmed = confirmAdminAction(
      `ยืนยันการลบทักษะ "${sk.name}" (${sk.slug}) หรือไม่?`,
    );
    if (!confirmed) return;

    setMessage('');
    setError('');
    try {
      await apiFetch(`/admin/skills/${sk.id}`, { method: 'DELETE' });
      setMessage(`ลบทักษะ "${sk.name}" เรียบร้อยแล้ว`);
      await loadSkills();
    } catch (err: any) {
      setError(err.message || 'ไม่สามารถลบทักษะที่ถูกอ้างอิงอยู่ได้');
    }
  };

  const filteredSkills = skills.filter((sk) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      sk.name?.toLowerCase().includes(q) ||
      sk.slug?.toLowerCase().includes(q) ||
      sk.category?.toLowerCase().includes(q) ||
      (sk.description && sk.description.toLowerCase().includes(q))
    );
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            จัดการทักษะมาตรฐาน (Master Skills Taxonomy)
          </h1>
        </div>
        <input
          type="text"
          className="input w-full sm:max-w-xs"
          placeholder="กรองทักษะในตาราง..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <AdminBanner
        message={message}
        error={error}
        onClear={() => {
          setMessage('');
          setError('');
        }}
      />

      <form onSubmit={handleCreate} className="card grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
        <div>
          <label className="label">ชื่อทักษะ</label>
          <input
            type="text"
            className="input"
            placeholder="เช่น Go, Rust, GraphQL, C#"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>
        <div>
          <label className="label">หมวดหมู่ทักษะ (11 หมวด)</label>
          <select
            className="input"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            {SKILL_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">คำอธิบาย</label>
          <input
            type="text"
            className="input"
            placeholder="คำอธิบายขอบเขตทักษะ (ถ้ามี)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <button type="submit" className="btn-primary">
          + เพิ่มทักษะมาตรฐาน
        </button>
      </form>

      <div className="card overflow-x-auto">
        {loading ? (
          <div className="p-8 text-center text-slate-500">กำลังโหลดทักษะ...</div>
        ) : (
          <table className="w-full min-w-[720px] text-sm text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 text-slate-600">
                <th className="py-2.5 px-3">ชื่อทักษะ</th>
                <th className="py-2.5 px-3">Slug</th>
                <th className="py-2.5 px-3">หมวดหมู่</th>
                <th className="py-2.5 px-3">คำอธิบาย</th>
                <th className="py-2.5 px-3">การอ้างอิง (งาน/คอร์ส/ข้อสอบ)</th>
                <th className="py-2.5 px-3">จัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredSkills.map((sk) => {
                const jobsCount = sk._count?.jobSkills ?? 0;
                const coursesCount = sk._count?.courseSkills ?? 0;
                const examsCount = sk._count?.assessments ?? 0;
                const candCount = sk._count?.candidateSkills ?? 0;
                const totalRefs = jobsCount + coursesCount + examsCount + candCount;

                return (
                  <tr key={sk.id} className="hover:bg-slate-50">
                    <td className="py-2.5 px-3 font-semibold text-slate-900">
                      {sk.name}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-xs text-slate-500">
                      {sk.slug}
                    </td>
                    <td className="py-2.5 px-3">
                      <span className="badge bg-slate-100 text-slate-700">
                        {sk.category}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-xs text-slate-600 max-w-xs truncate">
                      {sk.description || '-'}
                    </td>
                    <td className="py-2.5 px-3 text-xs">
                      <span
                        className={`badge ${
                          totalRefs > 0
                            ? 'bg-blue-50 text-blue-700'
                            : 'bg-emerald-50 text-emerald-700'
                        }`}
                      >
                        งาน {jobsCount} • คอร์ส {coursesCount} • ข้อสอบ {examsCount}
                        {candCount > 0 ? ` • ผู้สมัคร ${candCount}` : ''}
                      </span>
                    </td>
                    <td className="py-2.5 px-3">
                      <button
                        type="button"
                        onClick={() => handleDelete(sk)}
                        className="btn-danger text-xs"
                        title={
                          totalRefs > 0
                            ? `ถูกอ้างอิงอยู่ ${totalRefs} รายการ`
                            : 'ลบทักษะที่ไม่มีการอ้างอิง'
                        }
                      >
                        ลบ
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
