'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { startOAuthFlow } from '@/lib/oauth';
import { useAuth } from '@/lib/auth-context';

export default function LoginPage() {
  const router = useRouter();
  const { refreshUser } = useAuth();
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleGithubLogin = async (mockEmail?: string, mockName?: string, mockUsername?: string) => {
    setError('');
    setLoading(true);
    try {
      await startOAuthFlow('github', 'CANDIDATE', { mockEmail, mockName, mockUsername });
    } catch (err: any) {
      setError(err.message || 'ไม่สามารถเริ่มต้น GitHub OAuth ได้');
      setLoading(false);
    }
  };

  const handleGoogleLogin = async (mockEmail?: string, mockName?: string) => {
    setError('');
    setLoading(true);
    try {
      await startOAuthFlow('google', 'COMPANY', { mockEmail, mockName });
    } catch (err: any) {
      setError(err.message || 'ไม่สามารถเริ่มต้น Google OAuth ได้');
      setLoading(false);
    }
  };

  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await apiFetch('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: adminEmail, password: adminPassword }),
      });
      await refreshUser();
      let target = '/admin/dashboard';
      if (typeof window !== 'undefined') {
        const nextParam = new URLSearchParams(window.location.search).get('next');
        if (nextParam && nextParam.startsWith('/admin')) {
          target = nextParam;
        }
      }
      router.push(target);
    } catch (err: any) {
      setError(err.message || 'เข้าสู่ระบบผู้ดูแลไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 py-6">
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold text-slate-900">เข้าสู่ระบบ SmartCareer</h1>
        <p className="text-slate-600">
          เลือกช่องทางเข้าสู่ระบบตามบทบาทของคุณ (ผู้สมัครงานใช้ GitHub, บริษัทใช้ Google, ผู้ดูแลระบบใช้ Email/Password)
        </p>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
          {error}
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-6">
        {/* Candidate Login */}
        <div className="card space-y-4 flex flex-col justify-between">
          <div className="space-y-2">
            <span className="badge bg-blue-100 text-blue-800">สำหรับผู้สมัครงาน (CANDIDATE)</span>
            <h2 className="text-xl font-bold text-slate-900">เข้าสู่ระบบด้วย GitHub</h2>
            <p className="text-sm text-slate-600">
              เชื่อมต่อโปรไฟล์ GitHub เพื่อวิเคราะห์บริบท Repository และเข้าทำแบบทดสอบทักษะมาตรฐานกลาง
            </p>
          </div>
          <div className="space-y-2 pt-2">
            <button
              onClick={() => handleGithubLogin()}
              disabled={loading}
              className="w-full py-2.5 px-4 bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded-lg transition"
            >
              Continue with GitHub OAuth
            </button>
            <button
              onClick={() =>
                handleGithubLogin(
                  'somchai.dev@smartcareer.local',
                  'สมชาย สายโค้ด',
                  'somchai-dev'
                )
              }
              disabled={loading}
              className="w-full py-2 px-4 bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-semibold rounded-lg border border-blue-200 transition"
            >
              ⚡ ทดสอบเข้าสู่ระบบด้วยบัญชี Demo Candidate
            </button>
          </div>
        </div>

        {/* Company Login */}
        <div className="card space-y-4 flex flex-col justify-between">
          <div className="space-y-2">
            <span className="badge bg-emerald-100 text-emerald-800">สำหรับบริษัท (COMPANY)</span>
            <h2 className="text-xl font-bold text-slate-900">เข้าสู่ระบบด้วย Google</h2>
            <p className="text-sm text-slate-600">
              สำหรับฝ่ายทรัพยากรบุคคลและองค์กรเพื่อประกาศงาน สร้างข้อสอบคัดเลือก และประเมินผู้สมัครงาน
            </p>
          </div>
          <div className="space-y-2 pt-2">
            <button
              onClick={() => handleGoogleLogin()}
              disabled={loading}
              className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition"
            >
              Continue with Google OAuth
            </button>
            <button
              onClick={() => handleGoogleLogin('hr@technova.co.th', 'TechNova HR Team')}
              disabled={loading}
              className="w-full py-2 px-4 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-semibold rounded-lg border border-emerald-200 transition"
            >
              ⚡ ทดสอบเข้าสู่ระบบด้วยบัญชี Demo Company (TechNova Verified)
            </button>
          </div>
        </div>
      </div>

      {/* Admin Login */}
      <div className="card max-w-xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <span className="badge bg-purple-100 text-purple-800">ผู้ดูแลระบบ (ADMIN)</span>
            <h2 className="text-lg font-bold text-slate-900 mt-1">เข้าสู่ระบบผู้ดูแลระบบ</h2>
          </div>
        </div>
        <form onSubmit={handleAdminLogin} className="space-y-4">
          <div>
            <label className="label">อีเมลผู้ดูแลระบบ</label>
            <input
              type="email"
              className="input"
              value={adminEmail}
              onChange={(e) => setAdminEmail(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="label">รหัสผ่าน</label>
            <input
              type="password"
              className="input"
              value={adminPassword}
              onChange={(e) => setAdminPassword(e.target.value)}
              required
            />
          </div>
          <button type="submit" disabled={loading} className="btn-primary w-full">
            {loading ? 'กำลังดำเนินการ...' : 'เข้าสู่ระบบ Admin'}
          </button>
        </form>
      </div>
    </div>
  );
}
