'use client';

import React, { useEffect } from 'react';

export interface CourseDetailModalProps {
  course: any | null;
  onClose: () => void;
}

export function CourseDetailModal({ course, onClose }: CourseDetailModalProps) {
  useEffect(() => {
    if (!course) return;

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [course, onClose]);

  if (!course) return null;

  const isFree = course.provider === 'YOUTUBE' || course.isFree;
  const durationLabel =
    course.duration ||
    (course.durationHours ? `${course.durationHours} ชม.` : 'เรียนตามอัธยาศัย');

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="course-modal-title"
    >
      <div
        className="w-full max-w-2xl max-h-[85vh] bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="p-5 md:p-6 border-b border-slate-100 flex items-start justify-between gap-4 bg-slate-50/70">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="badge bg-blue-100 text-blue-800">
                {course.provider || 'COURSE'}
              </span>
              {course.rating && (
                <span className="badge bg-amber-100 text-amber-800">
                  ★ {Number(course.rating).toFixed(1)}
                </span>
              )}
              <span className="badge bg-slate-200 text-slate-700">
                {course.level || 'All Levels'}
              </span>
              <span className="badge bg-emerald-50 text-emerald-700">
                {durationLabel}
              </span>
            </div>

            <h2
              id="course-modal-title"
              className="text-lg md:text-xl font-bold text-slate-900 leading-snug"
            >
              {course.title}
            </h2>

            {course.source && (
              <p className="text-xs font-medium text-slate-600">
                ผู้สอน / ช่อง: <span className="text-slate-900">{course.source}</span>
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-500 hover:text-slate-800 hover:bg-slate-200/70 transition-colors shrink-0"
            aria-label="ปิดหน้าต่างรายละเอียดคอร์สเรียน"
          >
            ✕
          </button>
        </div>

        {/* Scrollable Modal Body */}
        <div className="p-5 md:p-6 overflow-y-auto space-y-5">
          {course.thumbnailUrl && (
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-100 max-h-52 flex items-center justify-center">
              <img
                src={course.thumbnailUrl}
                alt={course.title}
                className="w-full h-48 object-cover"
              />
            </div>
          )}

          <div className="space-y-2">
            <h3 className="text-sm font-bold text-slate-900">
              รายละเอียดคอร์สเรียน (Course Description)
            </h3>
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-sm text-slate-700 whitespace-pre-line leading-relaxed">
              {course.description || course.title}
            </div>
          </div>

          {(course.skills || []).length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-bold text-slate-900">
                ทักษะที่เกี่ยวข้องกับคอร์สนี้ ({course.skills.length})
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {(course.skills || []).map((cs: any) => (
                  <span
                    key={cs.id || cs.skillId || cs.skill?.id}
                    className="badge bg-indigo-50 text-indigo-700"
                  >
                    {cs.skill?.name || cs.name}
                    {cs.evidenceSource ? ` (${cs.evidenceSource})` : ''}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 md:px-6 border-t border-slate-100 bg-slate-50/70 flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-slate-600">
            <span className="font-semibold text-slate-800">
              {isFree ? 'เรียนฟรี (YouTube)' : 'คอร์สออนไลน์ (Udemy)'}
            </span>{' '}
            • เวลาเรียน {durationLabel}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="btn-secondary text-xs"
            >
              ปิดหน้าต่าง
            </button>
            <a
              href={course.url}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-primary text-xs"
            >
              ไปยังคอร์สเรียน ↗
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
