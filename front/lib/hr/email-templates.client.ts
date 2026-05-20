import {
  EmailTemplate,
  EmailTemplateCreatePayload,
  EmailTemplateMutationResponse,
  EmailTemplateRenderPayload,
  EmailTemplateRenderResponse,
  EmailTemplateUpdatePayload,
} from "@/types/emailTemplate";
import { hrApi } from "../api";

export const emailTemplateApi = {
  fetchEmailTemplates: async (): Promise<EmailTemplate[]> => {
    const response = await hrApi.get<EmailTemplate[]>("/api/email-templates");
    return response.data;
  },

  fetchEmailTemplate: async (templateId: number): Promise<EmailTemplate> => {
    const response = await hrApi.get<EmailTemplate>(
      `/api/email-templates/${templateId}`,
    );
    return response.data;
  },

  createEmailTemplate: async (
    data: EmailTemplateCreatePayload,
  ): Promise<EmailTemplate> => {
    const response = await hrApi.post<EmailTemplate>("/api/email-templates", data);
    return response.data;
  },

  updateEmailTemplate: async (
    templateId: number,
    data: EmailTemplateUpdatePayload,
  ): Promise<EmailTemplate> => {
    const response = await hrApi.patch<EmailTemplate>(
      `/api/email-templates/${templateId}`,
      data,
    );
    return response.data;
  },

  deleteEmailTemplate: async (
    templateId: number,
  ): Promise<EmailTemplateMutationResponse> => {
    const response = await hrApi.delete<EmailTemplateMutationResponse>(
      `/api/email-templates/${templateId}`,
    );
    return response.data;
  },

  renderEmailTemplate: async (
    templateId: number,
    data: EmailTemplateRenderPayload,
  ): Promise<EmailTemplateRenderResponse> => {
    const response = await hrApi.post<EmailTemplateRenderResponse>(
      `/api/email-templates/${templateId}/render`,
      {
        variables: data.variables ?? {},
      },
    );
    return response.data;
  },
};

