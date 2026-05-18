export interface InterviewerMailSendPayload {
  subject?: string;
  content?: string;
  templateId?: number;
  templateVariables?: Record<string, string | number | boolean | null>;
  expiresInDays?: number;
}

export interface InterviewerMailSendResponse {
  message: string;
  inviteUrl: string;
  expiresAt: string;
}

