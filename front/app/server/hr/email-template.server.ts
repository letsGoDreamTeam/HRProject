import "server-only";

import { EmailTemplate } from "@/types/emailTemplate";
import { apiServer } from "../axios-server";

export const fetchEmailTemplatesServer = async (): Promise<EmailTemplate[]> => {
  try {
    const response = await apiServer.get<EmailTemplate[]>("/api/email-templates");
    return response.data;
  } catch (error) {
    console.warn("[Server API] email templates load failed.", error);
    return [];
  }
};

