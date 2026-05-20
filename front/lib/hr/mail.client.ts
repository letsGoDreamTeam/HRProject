import { hrApi } from "../api";

export type CandidateMailVariableValue = string | number | boolean | null;

export interface CandidateMailPayload {
  subject?: string;
  content?: string;
  templateId?: number;
  templateVariables?: Record<string, CandidateMailVariableValue>;
  expiresAt?: string;
}

export interface CandidateMailResponse {
  message: string;
  invitationUrl: string;
  expiresAt: string;
}

export const candidateMailApi = {
  sendCandidateMail: async (
    candidateId: number,
    payload: CandidateMailPayload,
  ): Promise<CandidateMailResponse> => {
    const response = await hrApi.post<
      CandidateMailResponse & {
        invitation_url?: string;
        expires_at?: string;
      }
    >(
      `/api/candidates/${candidateId}/email`,
      payload,
    );

    return {
      message: response.data.message,
      invitationUrl:
        response.data.invitationUrl ?? response.data.invitation_url ?? "",
      expiresAt: response.data.expiresAt ?? response.data.expires_at ?? "",
    };
  },
};

