'use client';

import React, { useState, useEffect } from 'react';

const AVATAR_PALETTES = [
  'bg-blue-50 text-[#1D7AFC] border-blue-100',
  'bg-rose-50 text-rose-600 border-rose-100',
  'bg-emerald-50 text-emerald-600 border-emerald-100',
  'bg-purple-50 text-purple-600 border-purple-100',
  'bg-amber-50 text-amber-600 border-amber-100',
  'bg-cyan-50 text-cyan-600 border-cyan-100',
];

export function getCompanyDisplayName(job: any): string {
  if (!job) return 'บริษัทชั้นนำ';
  return (
    job.company?.name ||
    job.company?.companyName ||
    job.companyName ||
    job.externalCompanyName ||
    'บริษัทชั้นนำ'
  );
}

export function resolveJobLogoUrl(job: any): string | null {
  if (!job) return null;
  const candidate =
    job.companyLogoUrl ||
    job.company?.logoUrl ||
    job.logoUrl ||
    null;
  if (typeof candidate !== 'string') return null;
  const trimmed = candidate.trim();
  if (
    trimmed.startsWith('https://') ||
    trimmed.startsWith('http://') ||
    trimmed.startsWith('data:image/')
  ) {
    return trimmed;
  }
  return null;
}

export function getCompanyInitials(name: string): string {
  const clean = (name || '').replace(/[^a-zA-Z0-9ก-๙\s]/g, '').trim();
  if (!clean) return 'SC';
  const parts = clean.split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return clean.slice(0, 2).toUpperCase();
}

export function getAvatarPalette(name: string): string {
  const safeName = name || 'SC';
  let hash = 0;
  for (let i = 0; i < safeName.length; i++) {
    hash = (hash * 31 + safeName.charCodeAt(i)) >>> 0;
  }
  return AVATAR_PALETTES[hash % AVATAR_PALETTES.length];
}

export interface CompanyLogoProps {
  logoUrl?: string | null;
  companyName?: string | null;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const SIZE_CLASSES: Record<'sm' | 'md' | 'lg', string> = {
  sm: 'w-9 h-9 rounded-lg text-xs',
  md: 'w-10 h-10 rounded-xl text-sm',
  lg: 'w-14 h-14 rounded-2xl text-base',
};

export function CompanyLogo({
  logoUrl,
  companyName,
  size = 'md',
  className = '',
}: CompanyLogoProps) {
  const [imgError, setImgError] = useState(false);

  const normalizedUrl =
    typeof logoUrl === 'string' &&
    (logoUrl.trim().startsWith('https://') ||
      logoUrl.trim().startsWith('http://') ||
      logoUrl.trim().startsWith('data:image/'))
      ? logoUrl.trim()
      : null;

  useEffect(() => {
    setImgError(false);
  }, [normalizedUrl]);

  const displayName = (companyName || 'บริษัทชั้นนำ').trim() || 'บริษัทชั้นนำ';
  const initials = getCompanyInitials(displayName);
  const avatarPalette = getAvatarPalette(displayName);
  const sizeClass = SIZE_CLASSES[size] || SIZE_CLASSES.md;

  if (normalizedUrl && !imgError) {
    return (
      <div
        className={`${sizeClass} bg-white border border-slate-200/80 flex items-center justify-center overflow-hidden shrink-0 p-1 shadow-[0_1px_3px_rgba(15,23,42,0.04)] ${className}`}
      >
        <img
          src={normalizedUrl}
          alt={displayName}
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setImgError(true)}
          className="w-full h-full object-contain"
        />
      </div>
    );
  }

  return (
    <div
      className={`${sizeClass} font-extrabold flex items-center justify-center border shrink-0 ${avatarPalette} ${className}`}
      title={displayName}
    >
      {initials}
    </div>
  );
}
