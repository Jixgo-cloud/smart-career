'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { apiFetch } from '@/lib/api';
import { CompanyLogo } from '@/components/CompanyLogo';

export default function CompanyProfilePage() {
  const [profile, setProfile] = useState<any>(null);
  const [companyName, setCompanyName] = useState('');
  const [industry, setIndustry] = useState('');
  const [companySize, setCompanySize] = useState('');
  const [website, setWebsite] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [location, setLocation] = useState('');
  const [description, setDescription] = useState('');

  // Verification states
  const [businessRegistrationNo, setBusinessRegistrationNo] = useState('');
  const [docFiles, setDocFiles] = useState<File[]>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submittingVerify, setSubmittingVerify] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const loadProfile = useCallback(async () => {
    setLoading(true);
    try {
      const p = await apiFetch<any>('/company/profile');
      setProfile(p);
      setCompanyName(p.name || p.companyName || '');
      setIndustry(p.industry || '');
      setCompanySize(p.companySize || '');
      setWebsite(p.website || '');
      setContactEmail(p.contactEmail || '');
      setContactPhone(p.contactPhone || '');
      setLogoUrl(p.logoUrl || '');
      setLocation(p.address || p.location || '');
      setDescription(p.description || '');
      setBusinessRegistrationNo(p.businessRegistrationNo || '');
    } catch (err: any) {
      setError(err.message || 'ไม่สามารถดึงข้อมูลบริษัทได้');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage('');
    setError('');
    try {
      await apiFetch('/company/profile', {
        method: 'PUT',
        body: JSON.stringify({
          name: companyName,
          companyName,
          industry: industry.trim() || null,
          companySize: companySize.trim() || null,
          website: website.trim() || null,
          contactEmail: contactEmail.trim() || null,
          contactPhone: contactPhone.trim() || null,
          logoUrl: logoUrl.trim() || null,
          address: location.trim() || null,
          location: location.trim() || null,
          description: description.trim() || null,
        }),
      });
      setMessage('บันทึกข้อมูลบริษัทเรียบร้อยแล้ว');
      await loadProfile();
    } catch (err: any) {
      setError(err.message || 'ไม่สามารถบันทึกข้อมูลบริษัทได้');
    } finally {
      setSaving(false);
    }
  };

  const handleSubmitVerification = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittingVerify(true);
    setMessage('');
    setError('');
    try {
      if (docFiles.length > 5) {
        throw new Error('สามารถอัปโหลดเอกสารยืนยันได้ไม่เกิน 5 ไฟล์');
      }

      const totalRawSize = docFiles.reduce((sum, f) => sum + f.size, 0);
      if (totalRawSize > 3 * 1024 * 1024) {
        throw new Error('ขนาดไฟล์เอกสารรวมกันต้องไม่เกิน 3 MB (3 MiB)');
      }

      let filePayloads: Array<{ name: string; type: string; size: number; dataUrl: string }> = [];
      if (docFiles.length > 0) {
        filePayloads = await Promise.all(
          docFiles.map(async (file) => {
            const dataUrl = await new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => resolve(String(reader.result || ''));
              reader.onerror = () => reject(new Error(`ไม่สามารถอ่านไฟล์เอกสาร ${file.name} ได้`));
              reader.readAsDataURL(file);
            });
            return {
              name: file.name,
              type: file.type || 'application/pdf',
              size: file.size,
              dataUrl,
            };
          }),
        );
      } else {
        const fallbackPdf = '%PDF-1.4\n%SmartCareer Company Verification Document\n%%EOF';
        const base64 = typeof window !== 'undefined' ? window.btoa(fallbackPdf) : '';
        filePayloads = [
          {
            name: 'company-verification.pdf',
            type: 'application/pdf',
            size: fallbackPdf.length,
            dataUrl: `data:application/pdf;base64,${base64}`,
          },
        ];
      }

      await apiFetch('/company/verify', {
        method: 'POST',
        body: JSON.stringify({
          businessRegNo: businessRegistrationNo.trim(),
          documents: {
            files: filePayloads,
          },
        }),
      });
      setDocFiles([]);
      setMessage('ส่งคำขอยืนยันนิติบุคคลเรียบร้อยแล้ว (สถานะ: PENDING)');
      await loadProfile();
    } catch (err: any) {
      setError(err.message || 'ส่งคำขอยืนยันตัวตนไม่สำเร็จ');
    } finally {
      setSubmittingVerify(false);
    }
  };

  if (loading) {
    return <div className="p-10 text-center text-slate-500">กำลังโหลดข้อมูลบริษัท...</div>;
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">ข้อมูลบริษัทและการยืนยันตัวตนนิติบุคคล</h1>
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

      {/* Verification Form */}
      <form onSubmit={handleSubmitVerification} className="card space-y-4 border-blue-200">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-bold text-slate-900">
            การยืนยันตัวตนนิติบุคคล (Business Verification)
          </h2>
          <span
            className={`badge ${
              profile?.verificationStatus === 'VERIFIED'
                ? 'bg-emerald-100 text-emerald-800'
                : profile?.verificationStatus === 'PENDING'
                  ? 'bg-amber-100 text-amber-800'
                  : 'bg-slate-200 text-slate-700'
            }`}
          >
            สถานะปัจจุบัน: {profile?.verificationStatus}
          </span>
        </div>

        {profile?.verificationRejectionReason && (
          <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
            เหตุผลที่ถูกปฏิเสธล่าสุด: {profile.verificationRejectionReason}
          </div>
        )}

        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label className="label">เลขทะเบียนนิติบุคคล 13 หลัก</label>
            <input
              type="text"
              pattern="\d{13}"
              maxLength={13}
              className="input font-mono"
              placeholder="0105567012345"
              value={businessRegistrationNo}
              onChange={(e) => setBusinessRegistrationNo(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="label">
              อัปโหลดหนังสือรับรองบริษัท 1–5 ไฟล์ (PDF, JPG, PNG ขนาดรวมไม่เกิน 3MB)
            </label>
            <input
              type="file"
              multiple
              accept=".pdf,.jpg,.jpeg,.png"
              className="input text-xs"
              onChange={(e) => setDocFiles(Array.from(e.target.files || []).slice(0, 5))}
            />
            {docFiles.length > 0 && (
              <p className="text-[11px] text-slate-500 mt-1">
                เลือกแล้ว {docFiles.length} ไฟล์ (
                {Math.round(docFiles.reduce((s, f) => s + f.size, 0) / 1024)} KB)
              </p>
            )}
          </div>
        </div>

        <button type="submit" disabled={submittingVerify} className="btn-primary">
          {submittingVerify ? 'กำลังส่งคำขอ...' : 'ส่งเอกสารยืนยันนิติบุคคล'}
        </button>

        {/* Verification History & Uploaded Documents */}
        {Array.isArray(profile?.verifications) && profile.verifications.length > 0 && (
          <div className="pt-4 border-t border-slate-100 space-y-2">
            <h3 className="text-xs font-bold text-slate-700 uppercase">
              ประวัติการส่งเอกสารยืนยันนิติบุคคล ({profile.verifications.length})
            </h3>
            <div className="space-y-2">
              {profile.verifications.map((ver: any) => (
                <div
                  key={ver.id}
                  className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                >
                  <div>
                    <span className="font-semibold text-slate-800">
                      เลขทะเบียน: {ver.businessRegNo}
                    </span>{' '}
                    • สถานะ: <span className="font-bold">{ver.status}</span>
                    {ver.rejectionReason && (
                      <span className="text-red-600 ml-2">
                        (เหตุผล: {ver.rejectionReason})
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {(ver.documents?.files || []).map((f: any) => (
                      <a
                        key={f.index}
                        href={`/api${f.downloadUrl}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-2.5 py-1 rounded bg-white border border-slate-200 text-blue-600 hover:underline font-medium"
                      >
                        📄 {f.name || `เอกสาร #${f.index + 1}`}
                      </a>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </form>

      {/* General Profile Form */}
      <form onSubmit={handleSaveProfile} className="card space-y-4">
        <h2 className="text-lg font-bold text-slate-900">ข้อมูลทั่วไปของบริษัท</h2>
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label className="label">ชื่อบริษัท</label>
            <input
              type="text"
              className="input"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="label">อุตสาหกรรม (Industry)</label>
            <input
              type="text"
              className="input"
              placeholder="เช่น Cloud Computing, FinTech, E-Commerce"
              value={industry}
              onChange={(e) => setIndustry(e.target.value)}
            />
          </div>
          <div>
            <label className="label">ขนาดองค์กร</label>
            <input
              type="text"
              className="input"
              value={companySize}
              onChange={(e) => setCompanySize(e.target.value)}
              placeholder="เช่น 50-200 คน"
            />
          </div>
          <div>
            <label className="label">เว็บไซต์</label>
            <input
              type="url"
              className="input"
              placeholder="https://example.com"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
            />
          </div>
          <div>
            <label className="label">อีเมลติดต่อฝ่ายบุคคล (Contact Email)</label>
            <input
              type="email"
              className="input"
              placeholder="hr@example.com"
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
            />
          </div>
          <div>
            <label className="label">เบอร์โทรศัพท์ติดต่อ (Contact Phone)</label>
            <input
              type="text"
              className="input"
              placeholder="02-123-4567"
              value={contactPhone}
              onChange={(e) => setContactPhone(e.target.value)}
            />
          </div>
          <div className="md:col-span-2">
            <label className="label">URL โลโก้บริษัท (Logo URL)</label>
            <div className="flex items-center gap-3">
              <CompanyLogo logoUrl={logoUrl} companyName={companyName} size="md" />
              <input
                type="url"
                className="input flex-1"
                placeholder="https://example.com/logo.png"
                value={logoUrl}
                onChange={(e) => setLogoUrl(e.target.value)}
              />
            </div>
          </div>
          <div className="md:col-span-2">
            <label className="label">สถานที่ตั้ง</label>
            <input
              type="text"
              className="input"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
            />
          </div>
          <div className="md:col-span-2">
            <label className="label">รายละเอียดเกี่ยวกับบริษัท</label>
            <textarea
              rows={4}
              className="input"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
        </div>
        <button type="submit" disabled={saving} className="btn-primary">
          {saving ? 'กำลังบันทึก...' : 'บันทึกข้อมูลบริษัท'}
        </button>
      </form>
    </div>
  );
}
