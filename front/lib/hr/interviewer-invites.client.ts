import axios from "axios";
import {
  InterviewerAvailabilityResponse,
  InterviewerInviteAcceptPayload,
  InterviewerInviteAcceptResponse,
  InterviewerInvitePayload,
  InterviewerInviteResponse,
} from "@/types/interviewer";
import { hrApi } from "../api";

function normalizeInviteResponse(
  data: InterviewerInviteResponse & {
    invite_id?: number;
    interviewer_id?: number;
    invite_url?: string;
    expires_at?: string;
    reused?: boolean;
  },
): InterviewerInviteResponse {
  return {
    inviteId: data.inviteId ?? data.invite_id ?? 0,
    interviewerId: data.interviewerId ?? data.interviewer_id ?? 0,
    inviteUrl: data.inviteUrl ?? data.invite_url ?? "",
    expiresAt: data.expiresAt ?? data.expires_at ?? "",
    reused: data.reused ?? false,
  };
}

export const interviewerInviteApi = {
  getActiveInvite: async (
    interviewerId: number,
  ): Promise<InterviewerInviteResponse | null> => {
    try {
      const response = await hrApi.get<
        InterviewerInviteResponse & {
          invite_id?: number;
          invite_url?: string;
          expires_at?: string;
        }
      >(`/api/interviewers/${interviewerId}/active-invite`);
      return normalizeInviteResponse(response.data);
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        return null;
      }
      throw error;
    }
  },

  ensureInvite: async (
    payload: InterviewerInvitePayload,
  ): Promise<InterviewerInviteResponse> => {
    const response = await hrApi.post<
      InterviewerInviteResponse & {
        invite_id?: number;
        interviewer_id?: number;
        invite_url?: string;
        expires_at?: string;
        reused?: boolean;
      }
    >("/api/interviewer-invites", {
      interviewerId: payload.interviewerId,
      expiresInDays: payload.expiresInDays ?? 7,
    });
    return normalizeInviteResponse(response.data);
  },

  createInvite: async (
    payload: InterviewerInvitePayload,
  ): Promise<InterviewerInviteResponse> => {
    const response = await hrApi.post<
      InterviewerInviteResponse & {
        invite_id?: number;
        invite_url?: string;
        expires_at?: string;
      }
    >("/api/interviewer-invites", payload);
    return normalizeInviteResponse(response.data);
  },

  acceptInvite: async (
    payload: InterviewerInviteAcceptPayload,
  ): Promise<InterviewerInviteAcceptResponse> => {
    const response = await hrApi.post<
      InterviewerInviteAcceptResponse & {
        access_token?: string;
        token_type?: string;
      }
    >("/api/interviewer-invites/accept", payload);

    const data = response.data;
    return {
      accessToken: data.accessToken ?? data.access_token ?? "",
      tokenType: data.tokenType ?? data.token_type ?? "bearer",
      interviewer: data.interviewer,
    };
  },

  getAvailability: async (
    token: string,
  ): Promise<InterviewerAvailabilityResponse> => {
    const response = await hrApi.get<InterviewerAvailabilityResponse>(
      `/api/interviewer-invites/${token}/availability`,
    );
    return response.data;
  },

  submitAvailability: async (
    token: string,
    payload: { decision: "accepted" | "declined"; note?: string },
  ): Promise<InterviewerAvailabilityResponse> => {
    const response = await hrApi.post<InterviewerAvailabilityResponse>(
      `/api/interviewer-invites/${token}/availability`,
      payload,
    );
    return response.data;
  },
};

