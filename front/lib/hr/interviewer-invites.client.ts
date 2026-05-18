import { api } from "../api";

export interface InterviewerInviteCreatePayload {
  interviewerId: number;
  expiresInDays?: number;
}

export interface InterviewerInviteCreateResponse {
  inviteId: number;
  interviewerId: number;
  expiresAt: string;
  inviteUrl: string;
}

export const interviewerInviteApi = {
  createInvite: async (
    payload: InterviewerInviteCreatePayload,
  ): Promise<InterviewerInviteCreateResponse> => {
    const response = await api.post<InterviewerInviteCreateResponse>(
      "/api/interviewer-invites",
      payload,
    );
    return response.data;
  },
};

