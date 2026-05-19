export interface AvailableInterviewSlot {
  slotId: number;
  interviewRound: string;
  interviewStartsAt: string;
  interviewEndsAt: string;
  interviewLocation: string | null;
  remainingCapacity: number;
  interviewerNames: string[];
}

export interface InterviewBookingPayload {
  candidateId: number;
  slotId: number;
}

export interface InterviewBookingCancelPayload {
  candidateId: number;
}

export interface InterviewBookingResponse {
  bookingId: number;
  candidateId: number;
  slotId: number;
  interviewStartsAt: string;
  interviewEndsAt: string;
  interviewLocation: string | null;
  createdAt: string;
}

export interface InterviewBookingMutationResponse {
  message: string;
}

/**
 * 직무에 걸린 활성 booking 일괄 조회 응답.
 * 같은 직무 지원자 배정 UI에서 "다른 슬롯에 배정됨" 라벨을 그리고
 * 해당 슬롯 일자로 점프시키는 데 사용됩니다.
 */
export interface ActiveBookingSummary {
  bookingId: number;
  candidateId: number;
  slotId: number;
  positionId: number | null;
  positionName: string | null;
  interviewRound: string;
  interviewStartsAt: string;
  interviewEndsAt: string;
  interviewLocation: string | null;
  bookedAt: string;
}
