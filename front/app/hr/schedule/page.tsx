import { format } from "date-fns";
import { fetchApplicantsServer } from "@/app/server/hr/applicant.server";
import { fetchEmailTemplatesServer } from "@/app/server/hr/email-template.server";
import { fetchInterviewersServer } from "@/app/server/hr/interviewer.server";
import { fetchPositionsServer } from "@/app/server/hr/position.server";
import { fetchInterviewSlotsServer } from "@/app/server/hr/schedule.server";
import ScheduleClient from "@/components/hr/schedule/ScheduleClient";
import type { ScheduleClientInitialData } from "@/components/hr/schedule/types";

export default async function SchedulePage() {
  const today = new Date();
  const initialMonth = format(today, "yyyy-MM");

  const [slots, positions, applicants, interviewerList, emailTemplates] = await Promise.all([
    fetchInterviewSlotsServer({
      year: today.getFullYear(),
      month: today.getMonth() + 1,
    }),
    fetchPositionsServer(),
    fetchApplicantsServer(),
    fetchInterviewersServer({ size: 100 }),
    fetchEmailTemplatesServer(),
  ]);

  const initialData: ScheduleClientInitialData = {
    initialSlots: slots,
    initialPositions: positions,
    initialApplicants: applicants,
    initialInterviewers: interviewerList.content,
    initialEmailTemplates: emailTemplates,
    initialMonth,
  };

  return <ScheduleClient {...initialData} />;
}
