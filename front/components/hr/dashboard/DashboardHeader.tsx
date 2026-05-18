"use client";

import Link from "next/link";
import { useState } from "react";
import { Applicant } from "@/types/applicant";
import { EmailTemplate } from "@/types/emailTemplate";
import ScheduleBookingModal from "./ScheduleBookingModal";

interface DashboardHeaderProps {
  applicants: Applicant[];
  emailTemplates: EmailTemplate[];
}

export default function DashboardHeader({
  applicants,
  emailTemplates,
}: DashboardHeaderProps) {
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);

  return (
    <div className="mb-8 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-end">
      <div>
        <h1 className="text-2xl font-black tracking-tight text-slate-800">
          채용 대시보드
        </h1>
        <p className="mt-1 text-sm font-medium text-slate-500">
          현재 진행 중인 채용 파이프라인과 면접 일정을 한눈에 확인하세요.
        </p>
      </div>

      <div className="flex w-full gap-3 sm:w-auto">
        <Link
          href="/hr/applicants"
          className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 shadow-sm transition-all hover:bg-slate-50 sm:flex-none"
        >
          <i className="bx bx-list-ul text-lg" /> 지원자 리스트
        </Link>
        <button
          type="button"
          onClick={() => setIsScheduleModalOpen(true)}
          className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition-all hover:bg-slate-800 sm:flex-none"
        >
          <i className="bx bx-calendar-plus text-lg" /> 면접 일정 생성
        </button>
      </div>

      <ScheduleBookingModal
        isOpen={isScheduleModalOpen}
        applicants={applicants}
        emailTemplates={emailTemplates}
        onClose={() => setIsScheduleModalOpen(false)}
      />
    </div>
  );
}
