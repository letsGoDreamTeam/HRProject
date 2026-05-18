import { api } from "../api";
import {
  EmailTemplate,
  EmailTemplateRenderPayload,
  EmailTemplateRenderResponse,
} from "@/types/emailTemplate";

export const emailTemplateApi = {
  fetchTemplates: async (): Promise<EmailTemplate[]> => {
    const response = await api.get<EmailTemplate[]>("/api/email-templates");
    return response.data;
  },

  renderTemplate: async (
    templateId: number,
    payload: EmailTemplateRenderPayload,
  ): Promise<EmailTemplateRenderResponse> => {
    const response = await api.post<EmailTemplateRenderResponse>(
      `/api/email-templates/${templateId}/render`,
      payload,
    );
    return response.data;
  },
};

