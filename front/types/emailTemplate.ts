export interface EmailTemplate {
  id: number;
  name: string;
  subject: string;
  body: string;
}

export interface EmailTemplateRenderPayload {
  variables: Record<string, string | number | boolean | null>;
}

export interface EmailTemplateRenderResponse {
  subject: string;
  body: string;
}

