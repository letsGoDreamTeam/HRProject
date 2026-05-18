import { Applicant } from "@/types/applicant";
import { EmailTemplate } from "@/types/emailTemplate";
import {
  InterviewRoundWrite,
  InterviewSlotListItem,
} from "@/types/interviewSlotWrite";
import { HrInterviewer } from "@/types/interviewer";
import { Position } from "@/types/position";

/** `/hr/schedule` SSR initial data */
export interface ScheduleClientInitialData {
  initialSlots: InterviewSlotListItem[];
  initialPositions: Position[];
  initialApplicants: Applicant[];
  initialInterviewers: HrInterviewer[];
  initialEmailTemplates: EmailTemplate[];
  /** `yyyy-MM` */
  initialMonth: string;
}

export type ScheduleCalendarViewMode = "month" | "week";

export type ScheduleSlotFormMode = "create" | "edit";

export interface ScheduleSlotFormState {
  positionId: string;
  interviewRound: InterviewRoundWrite;
  interviewerIds: number[];
  interviewDate: string;
  interviewStartTime: string;
  interviewEndTime: string;
  interviewLocation: string;
  capacity: string;
}
