'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';

export default function CreateCompanyJobPage() {
  const router = useRouter();
  const [masterSkills, setMasterSkills] = useState<any[]>([]);
  const [companyAssessments, setCompanyAssessments] = useState<any[]>([]);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [requirements, setRequirements] = useState('');
  const [benefits, setBenefits] = useState('');
  const [jobType, setJobType] = useState('FULL_TIME');
  const [location, setLocation] = useState('กรุงเทพมหานคร');
  const [salaryMin, setSalaryMin] = useState(40000);
  const [salaryMax, setSalaryMax] = useState(80000);
  const [acceptedQuota, setAcceptedQuota] = useState(2);
  const [customAssessmentId, setCustomAssessmentId] = useState('');
  const [selectedSkills, setSelectedSkills] = useState<
    Array<{ skillId: string; isRequired: boolean; minimumScore: number; weight: number }>
  >([]);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([
      apiFetch<any[]>('/skills').catch(() => []),
      apiFetch<any[]>('/company/assessments').catch(() => []),
    ]).then(([sk, ass]) => {
      setMasterSkills(sk || []);
      setCompanyAssessments(ass || []);
      if (sk?.length > 0) {
        setSelectedSkills([
          { skillId: sk[0].id, isRequired: true, minimumScore: 65, weight: 2 },
        ]);
      }
    });
  }, []);

  const handleAddSkillRow = () => {
    if (masterSkills.length === 0) return;
    setSelectedSkills((prev) => [
      ...prev,
      { skillId: masterSkills[0].id, isRequired: true, minimumScore: 60, weight: 1 },
    ]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      await apiFetch('/company/jobs', {
        method: 'POST',
        body: JSON.stringify({
          title,
          description,
          requirements: requirements.trim() || undefined,
          benefits: benefits.trim() || undefined,
          employmentType: jobType,
          jobType,
          location,
          salaryMin: Number(salaryMin),
          salaryMax: Number(salaryMax),
          acceptedQuota: Number(acceptedQuota),
          customAssessmentId: customAssessmentId || undefined,
          skills: selectedSkills,
        }),
      });
      router.push('/company/jobs');
    } catch (err: any) {
      setError(err.message || 'ไม่สามารถสร้างประกาศงานได้');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">สร้างประกาศตำแหน่งงานใหม่</h1>

      {error && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="card space-y-4">
        <div>
          <label className="label">ชื่อตำแหน่งงาน</label>
          <input
            type="text"
            className="input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label className="label">รูปแบบการจ้างงาน</label>
            <select
              className="input"
              value={jobType}
              onChange={(e) => setJobType(e.target.value)}
            >
              <option value="FULL_TIME">Full-Time</option>
              <option value="PART_TIME">Part-Time</option>
              <option value="CONTRACT">Contract</option>
              <option value="INTERNSHIP">Internship</option>
              <option value="REMOTE">Remote</option>
            </select>
          </div>
          <div>
            <label className="label">สถานที่ปฏิบัติงาน</label>
            <input
              type="text"
              className="input"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
            />
          </div>
          <div>
            <label className="label">เงินเดือนขั้นต่ำ (บาท)</label>
            <input
              type="number"
              className="input"
              value={salaryMin}
              onChange={(e) => setSalaryMin(Number(e.target.value))}
            />
          </div>
          <div>
            <label className="label">เงินเดือนสูงสุด (บาท)</label>
            <input
              type="number"
              className="input"
              value={salaryMax}
              onChange={(e) => setSalaryMax(Number(e.target.value))}
            />
          </div>
          <div>
            <label className="label">โควต้าจำนวนที่รับเข้าทำงาน (ปิดงานอัตโนมัติเมื่อครบ)</label>
            <input
              type="number"
              min={1}
              className="input"
              value={acceptedQuota}
              onChange={(e) => setAcceptedQuota(Number(e.target.value))}
            />
          </div>
          <div>
            <label className="label">ข้อสอบคัดเลือกของบริษัท (ถ้ามี)</label>
            <select
              className="input"
              value={customAssessmentId}
              onChange={(e) => setCustomAssessmentId(e.target.value)}
            >
              <option value="">-- ไม่ผูกข้อสอบอัตโนมัติ --</option>
              {companyAssessments.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.title}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="label">รายละเอียดงานและหน้าที่ความรับผิดชอบ (รองรับการขึ้นบรรทัดใหม่และรายการหัวข้อ •)</label>
          <textarea
            rows={5}
            className="input"
            placeholder="อธิบายภาพรวมตำแหน่งงานและหน้าที่ความรับผิดชอบ..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            required
          />
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label className="label">คุณสมบัติผู้สมัคร (Requirements)</label>
            <textarea
              rows={4}
              className="input"
              placeholder="• ประสบการณ์พัฒนาซอฟต์แวร์...\n• ทักษะที่จำเป็น..."
              value={requirements}
              onChange={(e) => setRequirements(e.target.value)}
            />
          </div>
          <div>
            <label className="label">สวัสดิการ (Benefits)</label>
            <textarea
              rows={4}
              className="input"
              placeholder="• ประกันสุขภาพกลุ่ม\n• ทำงานแบบ Hybrid / Remote..."
              value={benefits}
              onChange={(e) => setBenefits(e.target.value)}
            />
          </div>
        </div>

        {/* Skills Configuration */}
        <div className="space-y-3 pt-2 border-t border-slate-100">
          <div className="flex items-center justify-between">
            <div>
              <label className="label mb-0">
                ทักษะที่ต้องการสำหรับตำแหน่งงานนี้ (จับคู่กับทักษะใน GitHub และผลสอบของผู้สมัคร)
              </label>
              <p className="text-[11px] text-slate-500">
                ระบุทักษะบังคับ (Required) และทักษะเสริม (Preferred) เพื่อให้ระบบคำนวณ Match Score อัตโนมัติ
              </p>
            </div>
            <button
              type="button"
              onClick={handleAddSkillRow}
              className="btn-secondary text-xs shrink-0"
            >
              + เพิ่มทักษะ
            </button>
          </div>

          {selectedSkills.map((row, idx) => (
            <div key={idx} className="grid grid-cols-3 gap-2 items-center">
              <select
                className="input text-xs"
                value={row.skillId}
                onChange={(e) =>
                  setSelectedSkills((prev) =>
                    prev.map((r, i) => (i === idx ? { ...r, skillId: e.target.value } : r))
                  )
                }
              >
                {masterSkills.map((sk) => (
                  <option key={sk.id} value={sk.id}>
                    {sk.name}
                  </option>
                ))}
              </select>

              <select
                className="input text-xs"
                value={row.isRequired ? 'true' : 'false'}
                onChange={(e) =>
                  setSelectedSkills((prev) =>
                    prev.map((r, i) =>
                      i === idx ? { ...r, isRequired: e.target.value === 'true' } : r
                    )
                  )
                }
              >
                <option value="true">Required (ทักษะบังคับ)</option>
                <option value="false">Preferred (ทักษะเสริม)</option>
              </select>

              <button
                type="button"
                onClick={() =>
                  setSelectedSkills((prev) => prev.filter((_, i) => i !== idx))
                }
                className="btn-danger text-xs"
              >
                ลบ
              </button>
            </div>
          ))}
        </div>

        <button type="submit" disabled={submitting} className="btn-primary w-full">
          {submitting ? 'กำลังบันทึกประกาศงาน...' : 'เผยแพร่ประกาศตำแหน่งงาน'}
        </button>
      </form>
    </div>
  );
}
