import { api } from "../api";
import {
  InterviewerMailSendPayload,
  InterviewerMailSendResponse,
} from "@/types/interviewerMail";

export const interviewerMailApi = {
  sendInterviewerMail: async (
    interviewerId: number,
    payload: InterviewerMailSendPayload,
  ): Promise<InterviewerMailSendResponse> => {
    const response = await api.post<InterviewerMailSendResponse>(
      `/api/interviewers/${interviewerId}/email`,
      payload,
    );
    return response.data;
  },
};

