'use client';

import React, { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { consumePkceVerifier } from '@/lib/oauth';
import { useAuth } from '@/lib/auth-context';

function OAuthCallbackInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { refreshUser } = useAuth();
  const [error, setError] = useState('');

  useEffect(() => {
    const code = searchParams.get('code');
    if (!code) {
      setError('ไม่พบรหัสยืนยันตัวตน (code) จาก OAuth callback');
      return;
    }

    const codeVerifier = consumePkceVerifier();
    if (!codeVerifier) {
      setError('ไม่พบ PKCE code_verifier ในเซสชัน กรุณาเข้าสู่ระบบใหม่อีกครั้ง');
      return;
    }

    apiFetch<any>('/auth/oauth/exchange', {
      method: 'POST',
      body: JSON.stringify({ code, verifier: codeVerifier }),
    })
      .then(async (res) => {
        await refreshUser();
        const role = res.user?.role;
        if (role === 'COMPANY') {
          router.replace('/company/dashboard');
        } else if (role === 'ADMIN') {
          router.replace('/admin/dashboard');
        } else {
          router.replace('/profile');
        }
      })
      .catch((err) => {
        setError(err.message || 'การแลกเปลี่ยนรหัส OAuth ล้มเหลวหรือถูกใช้งานไปแล้ว');
      });
  }, [searchParams, refreshUser, router]);

  return (
    <div className="max-w-md mx-auto mt-16 card text-center space-y-4">
      {error ? (
        <>
          <h2 className="text-lg font-bold text-red-600">เกิดข้อผิดพลาดในการยืนยันตัวตน</h2>
          <p className="text-sm text-slate-600">{error}</p>
          <button onClick={() => router.push('/login')} className="btn-primary">
            กลับไปหน้าเข้าสู่ระบบ
          </button>
        </>
      ) : (
        <>
          <div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full mx-auto" />
          <h2 className="text-lg font-bold text-slate-900">กำลังตรวจสอบสิทธิ์ PKCE และเข้าสู่ระบบ...</h2>
          <p className="text-sm text-slate-500">กรุณารอสักครู่</p>
        </>
      )}
    </div>
  );
}

export default function OAuthCallbackPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center">กำลังโหลด...</div>}>
      <OAuthCallbackInner />
    </Suspense>
  );
}
