export interface BackendPosition {
  positionId: number;
  positionName: string;
  createdAt: string;
}

export interface BackendCandidate {
  candidate_id: number;
  position_id: number | null;
  name: string | null;
  application_status: string;
  final_status: string;
  experience_level: string;
  meets_preferred_criteria: string[];
}

export interface BackendGeneratedQuestion {
  questionText: string;
  questionType: string;
  evaluationIntent: string;
  generationBasis: string;
}

export interface UIGeneratedQuestion extends BackendGeneratedQuestion {
  id: string;
  sourceCandidateId: number;
  sourcePositionId: number | null;
  sourceJobId: number;
}

export interface QuestionGeneratePayload {
  candidateId: number;
  positionId?: number;
  questionCount?: number;
  additionalRequest?: string;
}

export interface QuestionSavePayload {
  positionId?: number;
  candidateId?: number;
  generationJobId?: number;
  questions: Array<{
    questionText: string;
    questionType?: string;
    evaluationIntent?: string;
    generationBasis?: string;
    candidateId?: number;
    positionId?: number;
    generationJobId?: number;
  }>;
}

export interface QuestionGenerationJobCreateResponse {
  jobId: number;
  status: string;
}

export interface QuestionGenerationJobResponse {
  jobId: number;
  status: string;
  candidateId: number;
  positionId: number | null;
  resultQuestions: BackendGeneratedQuestion[] | null;
  errorMessage: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}

export type InterviewRound = "1차" | "2차" | "3차";

import type { Applicant } from "./applicant";

export interface HrInterviewer {
  interviewerId: number;
  interviewerEmail: string;
  interviewerName: string;
  positionId: number | null;
  positionName?: string | null;
  interviewRound: InterviewRound | string | null;
  createdAt: string;
}

export interface InterviewerListParams {
  page?: number;
  size?: number;
  keyword?: string;
  positionId?: number;
  interviewRound?: InterviewRound;
}

export interface InterviewerListResponse {
  content: HrInterviewer[];
  page?: number;
  size?: number;
  totalElements?: number;
  totalPages?: number;
}

export interface InterviewerPayload {
  interviewerEmail: string;
  interviewerName: string;
  positionId?: number | null;
  interviewRound?: InterviewRound | null;
}

export interface InterviewerMutationResponse {
  message: string;
}

export interface InterviewerInvitePayload {
  interviewerId: number;
  expiresInDays?: number;
}

export interface InterviewerInviteResponse {
  inviteId: number;
  interviewerId: number;
  inviteUrl: string;
  expiresAt: string;
  /** 기존 활성 링크를 재사용한 경우 true */
  reused?: boolean;
}

export interface InterviewerInviteAcceptPayload {
  token: string;
}

export interface InterviewerAuthInfo {
  interviewerId: number;
  interviewerEmail: string;
  interviewerName: string;
  positionId: number | null;
  interviewRound: string | null;
}

export interface InterviewerInviteAcceptResponse {
  accessToken: string;
  tokenType: string;
  interviewer: InterviewerAuthInfo;
}

export interface InterviewerAvailabilitySlotSummary {
  slotId: number;
  interviewRound: string;
  interviewStartsAt: string;
  interviewEndsAt: string;
  interviewLocation: string | null;
}

export interface InterviewerAvailabilityResponse {
  interviewer: InterviewerAuthInfo;
  expiresAt: string;
  decision: "accepted" | "declined" | null;
  note: string | null;
  decidedAt: string | null;
  slots: InterviewerAvailabilitySlotSummary[];
}

export interface InterviewerMailPayload {
  subject?: string;
  content?: string;
  templateId?: number;
  templateVariables?: Record<string, string | number | boolean | null>;
  expiresInDays?: number;
  interviewerEmail?: string;
}

export interface InterviewerMailResponse {
  message: string;
  inviteUrl?: string;
  expiresAt?: string | null;
  [key: string]: unknown;
}

export interface InterviewerMailComposerModalProps {
  isOpen: boolean;
  onClose: () => void;
  interviewer: HrInterviewer | null;
  /** 메일 작성 시 미리 채울 초대 링크 */
  initialInviteUrl?: string | null;
  initialExpiresInDays?: number;
  /** 기존 활성 링크를 불러온 경우 */
  inviteReused?: boolean;
  /** candidate_name 등 변수 선택용 면접관 목록 */
  allInterviewers?: readonly HrInterviewer[];
}
