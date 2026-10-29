'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { apiFetch } from '@/lib/api';
import { AdminBanner, confirmAdminAction } from '@/components/admin/ui';

export default function AdminIngestionPage() {
  const [logs, setLogs] = useState<any[]>([]);
  const [quotas, setQuotas] = useState<Record<string, any>>({});
  const [quotaEdits, setQuotaEdits] = useState<Record<string, number>>({});
  const [selectedSource, setSelectedSource] = useState('REMOTIVE');
  const [limit, setLimit] = useState(5);
  const [batchJson, setBatchJson] = useState('');
  const [batchPreview, setBatchPreview] = useState<any | null>(null);
  const [closedJobsPreview, setClosedJobsPreview] = useState<any | null>(null);
  const [closedCoursesPreview, setClosedCoursesPreview] = useState<any | null>(
    null,
  );
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const loadStatus = useCallback(async () => {
    try {
      const [logRes, quotaRes] = await Promise.all([
        apiFetch<any[]>('/admin/ingestion-logs').catch(() => []),
        apiFetch<Record<string, any>>('/ingestion/quotas').catch(() => ({})),
      ]);
      setLogs(logRes || []);
      setQuotas(quotaRes || {});
      const initialEdits: Record<string, number> = {};
      for (const [k, v] of Object.entries(quotaRes || {})) {
        initialEdits[k] =
          typeof v === 'object' && v !== null ? Number((v as any).quota) : Number(v);
      }
      setQuotaEdits(initialEdits);
    } catch (err: any) {
      setError(err?.message || 'ไม่สามารถโหลดสถานะระบบ Ingestion ได้');
    }
  }, []);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  const pollJobRunUntilDone = async (runId: string): Promise<any> => {
    for (let i = 0; i < 60; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      const updated = await apiFetch<any>(`/ingestion/job-runs/${runId}`);
      if (updated?.state === 'COMPLETED' || updated?.result) {
        return updated;
      }
    }
    throw new Error('การดึงข้อมูลใช้เวลานานเกินกำหนด กรุณาตรวจสอบในตารางประวัติ');
  };

  const handleSyncJobs = async () => {
    setRunning(true);
    setMessage('');
    setError('');
    try {
      const requestKey = `sync-${selectedSource.toLowerCase()}-${Date.now()}`;
      let res = await apiFetch<any>('/ingestion/sync-jobs', {
        method: 'POST',
        body: JSON.stringify({
          source: selectedSource,
          limit: Number(limit),
          requestKey,
        }),
      });

      if (
        (res?.state === 'FOLLOWING' || res?.state === 'RUNNING') &&
        !res?.result &&
        res?.id
      ) {
        setMessage(
          `กำลังรอคิวงานดึงข้อมูล ${selectedSource} ที่กำลังรันอยู่ให้เสร็จสิ้น (FOLLOWING)...`,
        );
        res = await pollJobRunUntilDone(res.id);
      }

      const r = res?.result || {};
      if (r.status === 'FAILED') {
        setError(
          `ดึงข้อมูลจาก ${selectedSource} ไม่สำเร็จ (${
            r.errorMessage || 'ถูกบล็อกหรือไม่พบข้อมูล'
          }) — ระบบบันทึกสถานะ FAILED โดยไม่สร้างข้อมูลปลอมตามกฎความปลอดภัย`,
        );
      } else {
        setMessage(
          `ดึงงานจาก ${selectedSource} สำเร็จ! (สร้างใหม่: ${
            r.createdCount ?? 0
          }, อัปเดต: ${r.updatedCount ?? 0}, ซ้ำ: ${
            r.duplicateCount ?? 0
          }, ข้ามงานไม่มีทักษะ: ${r.skippedCount ?? 0}, ปิดงานที่หมดอายุ: ${
            r.deactivatedClosedCount ?? 0
          })`,
        );
      }
      await loadStatus();
    } catch (err: any) {
      setError(err.message || 'เกิดข้อผิดพลาดในการดึงข้อมูลงาน');
    } finally {
      setRunning(false);
    }
  };

  const handleSyncCourses = async () => {
    setRunning(true);
    setMessage('');
    setError('');
    try {
      const res = await apiFetch<any>('/ingestion/sync-courses', {
        method: 'POST',
      });
      setMessage(
        `อัปเดตคลังคอร์สเรียนเสร็จสิ้น (เพิ่มใหม่: ${
          res.createdCount ?? 0
        }, อัปเดต: ${res.updatedCount ?? 0}, ลบคอร์สที่ปิดแล้ว: ${
          res.cleanedClosedCount ?? 0
        })`,
      );
      await loadStatus();
    } catch (err: any) {
      setError(err.message || 'อัปเดตคอร์สเรียนไม่สำเร็จ');
    } finally {
      setRunning(false);
    }
  };

  const handleBackfill = async (endpoint: string, label: string) => {
    setRunning(true);
    setMessage('');
    setError('');
    try {
      const res = await apiFetch<any>(endpoint, { method: 'POST' });
      setMessage(`ดำเนินการ ${label} สำเร็จ (${JSON.stringify(res)})`);
      await loadStatus();
    } catch (err: any) {
      setError(err.message || `ดำเนินการ ${label} ไม่สำเร็จ`);
    } finally {
      setRunning(false);
    }
  };

  const handleSaveQuotas = async () => {
    setRunning(true);
    setMessage('');
    setError('');
    try {
      await apiFetch('/ingestion/quotas', {
        method: 'PUT',
        body: JSON.stringify(quotaEdits),
      });
      setMessage('บันทึกการตั้งค่าโควตาการดึงข้อมูล (Ingestion Quotas) เรียบร้อยแล้ว');
      await loadStatus();
    } catch (err: any) {
      setError(err.message || 'ไม่สามารถบันทึกโควตาได้');
    } finally {
      setRunning(false);
    }
  };

  const handleResetQuotas = async () => {
    const confirmed = confirmAdminAction(
      'ยืนยันการรีเซ็ตโควตาการดึงข้อมูลทุกแหล่งกลับเป็นค่าเริ่มต้นหรือไม่?',
    );
    if (!confirmed) return;

    setRunning(true);
    setMessage('');
    setError('');
    try {
      await apiFetch('/ingestion/quotas/reset', { method: 'POST' });
      setMessage('รีเซ็ตโควตาการดึงข้อมูลกลับเป็นค่าเริ่มต้นเรียบร้อยแล้ว');
      await loadStatus();
    } catch (err: any) {
      setError(err.message || 'ไม่สามารถรีเซ็ตโควตาได้');
    } finally {
      setRunning(false);
    }
  };

  const handleFillSampleLocalBatch = () => {
    const num = String(Date.now()).slice(-7);
    const sample = {
      version: 1,
      source: 'JOBSDB',
      collectedAt: new Date().toISOString(),
      jobs: [
        {
          id: `jobsdb-${num}`,
          title: 'Full-Stack TypeScript & Node.js Engineer',
          company: 'Siam Digital Platform Co., Ltd.',
          logoUrl: null,
          description:
            'Develop and scale web applications using TypeScript, React, Next.js, Node.js, NestJS, and PostgreSQL.',
          location: 'Bangkok, Thailand',
          url: `https://th.jobsdb.com/job/${num}`,
        },
      ],
    };
    setBatchJson(JSON.stringify(sample, null, 2));
    setBatchPreview(null);
  };

  const handlePreviewLocalBatch = async () => {
    setRunning(true);
    setMessage('');
    setError('');
    try {
      const parsed = JSON.parse(batchJson);
      const res = await apiFetch<any>('/ingestion/local-jobs/preview', {
        method: 'POST',
        body: JSON.stringify(parsed),
      });
      setBatchPreview(res);
      setMessage(
        `ตรวจสอบ JSON Batch สำเร็จ: ทั้งหมด ${res.totalCount} งาน (งานใหม่: ${res.newCount}, ซ้ำ: ${res.duplicateCount}, ข้ามเพราะไม่มีทักษะ: ${res.skippedNoSkillCount})`,
      );
    } catch (err: any) {
      setBatchPreview(null);
      setError(err.message || 'รูปแบบ JSON ไม่ถูกต้องหรือไม่ผ่านเกณฑ์การตรวจสอบ');
    } finally {
      setRunning(false);
    }
  };

  const handleImportLocalBatch = async () => {
    setRunning(true);
    setMessage('');
    setError('');
    try {
      const parsed = JSON.parse(batchJson);
      const confirmed = confirmAdminAction(
        `ยืนยันการนำเข้า Local Job Batch (${
          parsed?.jobs?.length ?? 0
        } รายการ) ลงฐานข้อมูลจริงหรือไม่? (ประกาศงานที่นำเข้าจะแสดงในหน้าค้นหางานของผู้สมัคร)`,
      );
      if (!confirmed) {
        setRunning(false);
        return;
      }

      const res = await apiFetch<any>('/ingestion/local-jobs', {
        method: 'POST',
        body: JSON.stringify({
          requestKey: `local-batch-${Date.now()}`,
          batch: parsed,
        }),
      });
      const r = res.result || {};
      setMessage(
        `นำเข้า Local Job Batch สำเร็จ! (สร้างใหม่: ${
          r.createdCount ?? 0
        }, อัปเดต: ${r.updatedCount ?? 0}, ซ้ำ: ${
          r.duplicateCount ?? 0
        }, ข้ามงานไม่มีทักษะ: ${r.skippedCount ?? 0}, ปิดงานที่หมดอายุ: ${
          r.deactivatedClosedCount ?? 0
        })`,
      );
      setBatchPreview(null);
      await loadStatus();
    } catch (err: any) {
      setError(err.message || 'รูปแบบ JSON ไม่ถูกต้องหรือการนำเข้าล้มเหลว');
    } finally {
      setRunning(false);
    }
  };

  const handlePreviewClosedJobs = async () => {
    setRunning(true);
    setError('');
    try {
      const res = await apiFetch<any>('/ingestion/preview-closed-jobs?limit=50');
      setClosedJobsPreview(res);
    } catch (err: any) {
      setError(err.message || 'ไม่สามารถตรวจสอบงานที่ปิดแล้วได้');
    } finally {
      setRunning(false);
    }
  };

  const handleCleanupClosedJobs = async () => {
    const confirmed = confirmAdminAction(
      'ยืนยันการปิดสถานะ (DEACTIVATE) งานที่หมดอายุทั้งหมดเพื่อรักษาประวัติใบสมัครหรือไม่?',
    );
    if (!confirmed) return;

    setRunning(true);
    setMessage('');
    setError('');
    try {
      const res = await apiFetch<any>('/ingestion/cleanup-closed-jobs?limit=100', {
        method: 'POST',
        body: JSON.stringify({ deleteMode: 'DEACTIVATE' }),
      });
      setMessage(
        `ทำความสะอาดงานที่หมดอายุสำเร็จ: ปิดสถานะใหม่ ${res.deactivatedCount} งาน (รวมงานที่ปิดแล้วทั้งหมด ${res.totalClosedCount} งาน)`,
      );
      await handlePreviewClosedJobs();
      await loadStatus();
    } catch (err: any) {
      setError(err.message || 'ไม่สามารถปิดงานที่หมดอายุได้');
    } finally {
      setRunning(false);
    }
  };

  const handlePreviewClosedCourses = async () => {
    setRunning(true);
    setError('');
    try {
      const res = await apiFetch<any>('/ingestion/preview-closed-courses?limit=50');
      setClosedCoursesPreview(res);
    } catch (err: any) {
      setError(err.message || 'ไม่สามารถตรวจสอบคอร์สที่ปิดแล้วได้');
    } finally {
      setRunning(false);
    }
  };

  const handleCleanupClosedCourses = async () => {
    const items: any[] = closedCoursesPreview?.items || [];
    if (items.length === 0) return;
    const confirmed = confirmAdminAction(
      `ยืนยันการลบคอร์สเรียนที่ปิดหรือลิงก์ไม่ถูกต้องจำนวน ${items.length} คอร์สหรือไม่?`,
    );
    if (!confirmed) return;

    setRunning(true);
    setMessage('');
    setError('');
    try {
      const res = await apiFetch<any>('/ingestion/cleanup-closed-courses', {
        method: 'POST',
        body: JSON.stringify({ courseIds: items.map((c) => c.id) }),
      });
      setMessage(`ลบคอร์สที่ปิดแล้วสำเร็จจำนวน ${res.deletedCount} รายการ`);
      await handlePreviewClosedCourses();
      await loadStatus();
    } catch (err: any) {
      setError(err.message || 'ไม่สามารถลบคอร์สที่ปิดแล้วได้');
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">
          จัดการระบบดึงข้อมูลงานและคอร์สเรียน (Data Scraping &amp; Ingestion)
        </h1>
        <p className="text-sm text-slate-600">
          รองรับการดึงข้อมูลสดจาก API/เว็บภายนอก (Remotive, Blognone, JobsDB, JSearch) ตั้งค่าโควตา นำเข้าผ่าน Local Job Batch พร้อมระบบ Durable Lock (IngestionRun)
        </p>
      </div>

      <AdminBanner
        message={message}
        error={error}
        onClear={() => {
          setMessage('');
          setError('');
        }}
      />

      {/* 1. Live Job Scraping / API Sync */}
      <div className="card space-y-4">
        <h2 className="text-lg font-bold text-slate-900">
          1. ดึงประกาศงานสดจากแหล่งภายนอก (Live Scraping &amp; API Ingestion)
        </h2>
        <div className="grid md:grid-cols-4 gap-4 items-end">
          <div>
            <label className="label">เลือกแหล่งข้อมูล (Source)</label>
            <select
              className="input"
              value={selectedSource}
              onChange={(e) => setSelectedSource(e.target.value)}
            >
              <option value="REMOTIVE">
                REMOTIVE (ดึงสดได้ทันที ไม่ใช้คีย์)
              </option>
              <option value="BLOGNONE">
                BLOGNONE (HTML Scraper / Local Batch)
              </option>
              <option value="JOBSDB">JOBSDB (HTML Scraper / Local Batch)</option>
              <option value="JSEARCH">
                JSEARCH (ต้องตั้งค่า JSEARCH_API_KEY)
              </option>
              <option value="JOBTHAI">JOBTHAI</option>
            </select>
          </div>
          <div>
            <label className="label">จำนวนที่ดึงต่อรอบ (Quota Limit)</label>
            <input
              type="number"
              min={1}
              max={100}
              className="input"
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value))}
            />
          </div>
          <div className="md:col-span-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleSyncJobs}
              disabled={running}
              className="btn-primary"
            >
              {running
                ? 'กำลังดึงข้อมูล...'
                : `▶ สั่งดึงงานจาก ${selectedSource}`}
            </button>
            <button
              type="button"
              onClick={handleSyncCourses}
              disabled={running}
              className="btn-secondary"
            >
              อัปเดตคอร์สเรียน (Sync Courses)
            </button>
          </div>
        </div>
      </div>

      {/* 2. Local Job Batch JSON Import + Preview */}
      <div className="card space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              2. นำเข้าไฟล์ JSON จากสคริปต์ Scraper ภายนอก (Local Job Batch Import: JOBSDB / BLOGNONE)
            </h2>
            <p className="text-xs text-slate-500">
              ใช้สำหรับกรณีเว็บต้นทางบล็อก IP ของเซิร์ฟเวอร์ สามารถตรวจสอบ (Preview) ก่อนนำเข้าจริงเพื่อป้องกันข้อมูลตัวอย่างปะปนในระบบ
            </p>
          </div>
          <button
            type="button"
            onClick={handleFillSampleLocalBatch}
            className="btn-secondary text-xs shrink-0"
          >
            เติมตัวอย่าง JSON Batch ที่ถูกต้อง
          </button>
        </div>

        <textarea
          rows={8}
          className="w-full font-mono text-xs p-3 rounded-xl bg-slate-900 text-slate-100 border border-slate-700"
          placeholder='{"version":1,"source":"JOBSDB","collectedAt":"...","jobs":[...]}'
          value={batchJson}
          onChange={(e) => {
            setBatchJson(e.target.value);
            setBatchPreview(null);
          }}
        />

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handlePreviewLocalBatch}
            disabled={running || !batchJson.trim()}
            className="btn-secondary text-xs"
          >
            🔍 ตรวจสอบตัวอย่างก่อนนำเข้า (Preview Batch)
          </button>
          <button
            type="button"
            onClick={handleImportLocalBatch}
            disabled={running || !batchJson.trim()}
            className="btn-primary text-xs"
          >
            นำเข้า Local Job Batch ลงฐานข้อมูล
          </button>
        </div>

        {batchPreview && (
          <div className="p-4 rounded-xl bg-blue-50 border border-blue-200 text-xs space-y-2">
            <div className="font-bold text-blue-900">
              ผลการตรวจสอบก่อนนำเข้า ({batchPreview.source}): ทั้งหมด{' '}
              {batchPreview.totalCount} งาน • งานใหม่ {batchPreview.newCount} • ซ้ำ{' '}
              {batchPreview.duplicateCount} • ข้ามเพราะไม่มีทักษะ{' '}
              {batchPreview.skippedNoSkillCount}
            </div>
            <ul className="list-disc list-inside text-blue-800 space-y-1">
              {(batchPreview.items || []).map((item: any) => (
                <li key={item.id}>
                  <b>{item.title}</b> ({item.company}) — สกัดทักษะได้{' '}
                  {item.extractedSkillsCount} ทักษะ{' '}
                  {item.isDuplicate ? '[ซ้ำในระบบ]' : '[รายการใหม่]'}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* 3. Quota Configuration Panel */}
      <div className="card space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              3. ตั้งค่าโควตาการดึงข้อมูลต่อรอบ (Ingestion Quota Governance)
            </h2>
            <p className="text-xs text-slate-500">
              กำหนดจำนวนรายการสูงสุดต่อรอบสำหรับแต่ละแหล่งข้อมูลงานและคอร์สเรียน (1–100 รายการ)
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSaveQuotas}
              disabled={running}
              className="btn-primary text-xs"
            >
              บันทึกโควตา (Save Quotas)
            </button>
            <button
              type="button"
              onClick={handleResetQuotas}
              disabled={running}
              className="btn-secondary text-xs"
            >
              รีเซ็ตค่าเริ่มต้น (Reset)
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
          {Object.entries(quotas).map(([key, meta]: [string, any]) => (
            <div
              key={key}
              className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-1"
            >
              <div className="text-xs font-bold text-slate-800">{key}</div>
              <div className="text-[10px] text-slate-500">
                {meta?.category || 'JOB'} (ค่าเริ่มต้น {meta?.default ?? 15})
              </div>
              <input
                type="number"
                min={meta?.min ?? 1}
                max={meta?.max ?? 100}
                className="input text-xs"
                value={quotaEdits[key] ?? meta?.quota ?? 15}
                onChange={(e) =>
                  setQuotaEdits((prev) => ({
                    ...prev,
                    [key]: Number(e.target.value),
                  }))
                }
              />
            </div>
          ))}
        </div>
      </div>

      {/* 4. Data Maintenance, Backfill & Cleanup Tools */}
      <div className="card space-y-4">
        <h2 className="text-lg font-bold text-slate-900">
          4. เครื่องมือสกัดทักษะย้อนหลัง เสริมข้อมูล AI และทำความสะอาดข้อมูลที่ปิดแล้ว (Backfill &amp; Cleanup)
        </h2>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() =>
              handleBackfill('/ingestion/backfill-skills', 'Backfill Job Skills')
            }
            disabled={running}
            className="btn-secondary text-xs"
          >
            สกัดทักษะงานย้อนหลัง
          </button>
          <button
            type="button"
            onClick={() =>
              handleBackfill(
                '/ingestion/backfill-course-skills',
                'Backfill Course Skills',
              )
            }
            disabled={running}
            className="btn-secondary text-xs"
          >
            สกัดทักษะคอร์สเรียนย้อนหลัง
          </button>
          <button
            type="button"
            onClick={() =>
              handleBackfill(
                '/ingestion/enrich-jobs-ai?limit=5',
                'AI Job Enrichment',
              )
            }
            disabled={running}
            className="btn-secondary text-xs"
          >
            ✨ เสริมข้อมูลงานด้วย AI (5 งาน)
          </button>
          <button
            type="button"
            onClick={handlePreviewClosedJobs}
            disabled={running}
            className="btn-secondary text-xs"
          >
            ตรวจสอบงานที่ปิด/หมดอายุ
          </button>
          <button
            type="button"
            onClick={handleCleanupClosedJobs}
            disabled={running}
            className="btn-secondary text-xs"
          >
            ปิดงานที่หมดอายุ (Cleanup Closed Jobs)
          </button>
          <button
            type="button"
            onClick={handlePreviewClosedCourses}
            disabled={running}
            className="btn-secondary text-xs"
          >
            ตรวจสอบคอร์สที่ปิดแล้ว
          </button>
        </div>

        {closedJobsPreview && (
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-1">
            <div className="font-semibold text-slate-800">
              งานที่ปิดหรือหมดอายุในระบบ: พบ {closedJobsPreview.totalPreviewed} รายการ
            </div>
          </div>
        )}

        {closedCoursesPreview && (
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs flex items-center justify-between">
            <div className="font-semibold text-slate-800">
              คอร์สเรียนที่ปิดหรือลิงก์ไม่ถูกต้อง: พบ{' '}
              {closedCoursesPreview.totalPreviewed} รายการ
            </div>
            {closedCoursesPreview.totalPreviewed > 0 && (
              <button
                type="button"
                onClick={handleCleanupClosedCourses}
                className="btn-danger text-xs"
              >
                ลบคอร์สที่ปิดแล้ว ({closedCoursesPreview.totalPreviewed})
              </button>
            )}
          </div>
        )}
      </div>

      {/* 5. Recent Ingestion Logs */}
      <div className="card space-y-4">
        <h2 className="text-lg font-bold text-slate-900">
          ประวัติการดึงข้อมูลล่าสุด (Ingestion Audit Logs)
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 text-slate-600">
                <th className="py-2.5 px-3">แหล่งข้อมูล (Source)</th>
                <th className="py-2.5 px-3">สถานะ</th>
                <th className="py-2.5 px-3">Created / Updated / Duplicate</th>
                <th className="py-2.5 px-3">รายละเอียด / ข้อผิดพลาด</th>
                <th className="py-2.5 px-3">เวลา</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {logs.map((r: any) => (
                <tr key={r.id} className="hover:bg-slate-50">
                  <td className="py-2.5 px-3 font-semibold">{r.source}</td>
                  <td className="py-2.5 px-3">
                    <span
                      className={`badge ${
                        r.status === 'SUCCESS'
                          ? 'bg-emerald-100 text-emerald-800'
                          : r.status === 'FAILED'
                            ? 'bg-red-100 text-red-700'
                            : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {r.status}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 font-mono text-xs">
                    {r.createdCount} / {r.updatedCount} / {r.duplicateCount}
                  </td>
                  <td className="py-2.5 px-3 text-xs text-slate-600">
                    {r.errorMessage || 'สำเร็จปกติ'}
                  </td>
                  <td className="py-2.5 px-3 text-xs text-slate-500">
                    {new Date(r.startedAt).toLocaleString('th-TH')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
