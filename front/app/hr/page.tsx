import React from "react";
import DashboardHeader from "@/components/hr/dashboard/DashboardHeader";
import {
  Q1Summary,
  Q2Summary,
  Q1Data,
  Q2Data,
} from "@/components/hr/dashboard/SummaryQuadrants";
import Q3TodayInterviews, {
  TodayInterview,
} from "@/components/hr/dashboard/Q3TodayInterviews";
import DeptStatusDashboard from "@/components/hr/dashboard/DeptStatusDashboard";
import { DeptStatus } from "@/types/hr";
import { fetchEmailTemplatesServer } from "../server/hr/email-template.server";
import {
  fetchApplicantsServer,
  fetchDeptStatusServer,
  fetchInterviewSlotsServer,
} from "../server/hr/applicant.server";

// 💡 SSR 데이터 패칭 시뮬레이션
async function getDashboardData() {
  const results = await Promise.all([
    fetchApplicantsServer(),
    fetchInterviewSlotsServer(),
    fetchDeptStatusServer(),
    fetchEmailTemplatesServer(),
  ]);
  const q2 = results[0];
  const q1 = results[1];
  const q4 = results[2];
  const emailTemplates = results[3];

  const totalApplicants: number = q2.length;
  const activeJobs: number = new Set(
    q2.map((applicant) => applicant.position_id),
  ).size;
  const todayHiringTeamCount = new Set(q1.map((slot) => slot.positionName))
    .size;
  const q1Data: Q1Data = {
    todayIntervieweeCount: 14,
    todayHiringTeamCount: todayHiringTeamCount,
  };

  const q2Data: Q2Data = {
    totalApplicants: totalApplicants,
    activeJobs: activeJobs,
  };

  const q3Data: TodayInterview[] = [
    {
      id: "1",
      time: "10:00",
      applicant: "홍길동",
      job: "프론트엔드",
      round: "1차 기술면접",
      status: "응시 완료",
    },
    {
      id: "2",
      time: "14:30",
      applicant: "김철수",
      job: "백엔드",
      round: "최종 임원면접",
      status: "응시 중",
    },
    {
      id: "3",
      time: "16:00",
      applicant: "이영희",
      job: "UX/UI 디자이너",
      round: "1차 실무면접",
      status: "응시 전",
    },
  ];

  const q4Data: DeptStatus[] = q4;

  return { q1Data, q2Data, q3Data, q4Data, applicants: q2, emailTemplates };
}

export default async function HrDashboardPage() {
  const { q1Data, q2Data, q3Data, q4Data, applicants, emailTemplates } =
    await getDashboardData();

  return (
    <div className="w-full animate-in fade-in duration-500">
      {/* 상단 헤더 및 모달 버튼 */}
      <DashboardHeader applicants={applicants} emailTemplates={emailTemplates} />

      {/* 2x2 사분면 그리드 레이아웃 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6">
        {/* 상단 행 (1, 2사분면) */}
        {/* 💡 반응형 높이 조정: 모바일은 auto로 자연스럽게, 태블릿/PC는 h-32(128px)로 아주 슬림하게! */}
        <div className="h-auto md:h-32">
          <Q2Summary data={q2Data} />
        </div>
        <div className="h-auto md:h-32">
          <Q1Summary data={q1Data} />
        </div>

        {/* 하단 행 (3, 4사분면) */}
        <div className="min-h-100 lg:h-125">
          <Q3TodayInterviews data={q3Data} />
        </div>
        <div className="min-h-100 lg:h-125">
          <DeptStatusDashboard initialData={q4Data} />
        </div>
      </div>
    </div>
  );
}
