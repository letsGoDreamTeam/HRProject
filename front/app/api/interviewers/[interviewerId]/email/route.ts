import { NextRequest, NextResponse } from "next/server";
import { render } from "@react-email/render";
import { createElement } from "react";
import { Resend } from "resend";
import { getBackendBaseUrl } from "@/app/server/http/fetch-backend";
import InterviewerInviteEmail from "@/components/emails/InterviewerInviteEmail";

type InterviewerInviteResponse = {
  inviteUrl?: string;
  invite_url?: string;
  expiresAt?: string;
  expires_at?: string;
};

type MailRequestBody = {
  subject?: string;
  content?: string;
  expiresInDays?: number;
  interviewerEmail?: string;
};

export const runtime = "nodejs";

function getRequiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required.`);
  }
  return value;
}

function replaceInviteTokens(content: string, inviteUrl: string): string {
  return content
    .replaceAll("{invite_url}", inviteUrl)
    .replaceAll("{invitation_url}", inviteUrl)
    .replaceAll("{access_link}", inviteUrl);
}

function buildPreviewText(subject: string, content: string): string {
  const normalized = content.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return subject;
  }
  return normalized.length > 90 ? `${normalized.slice(0, 87)}...` : normalized;
}

function getBearerFromAuthStorage(raw: string | undefined): string | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { state?: { token?: string | null } };
    const token = parsed?.state?.token?.trim();
    return token ? `Bearer ${token}` : null;
  } catch {
    try {
      const decoded = decodeURIComponent(raw);
      const parsed = JSON.parse(decoded) as { state?: { token?: string | null } };
      const token = parsed?.state?.token?.trim();
      return token ? `Bearer ${token}` : null;
    } catch {
      return null;
    }
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ interviewerId: string }> },
) {
  try {
    const { interviewerId } = await context.params;
    const parsedInterviewerId = Number(interviewerId);
    if (!Number.isFinite(parsedInterviewerId) || parsedInterviewerId <= 0) {
      return NextResponse.json(
        { message: "Invalid interviewer id." },
        { status: 400 },
      );
    }

    const body = (await request.json()) as MailRequestBody;
    const subject = body.subject?.trim() ?? "";
    const content = body.content ?? "";
    const interviewerEmail = body.interviewerEmail?.trim();
    const expiresInDays = body.expiresInDays ?? 7;

    if (!subject || !content) {
      return NextResponse.json(
        { message: "subject and content are required." },
        { status: 400 },
      );
    }

    if (!interviewerEmail) {
      return NextResponse.json(
        { message: "interviewerEmail is required." },
        { status: 400 },
      );
    }

    const authHeader =
      request.headers.get("authorization") ??
      (() => {
        const accessToken = request.cookies.get("accessToken")?.value?.trim();
        if (accessToken) return `Bearer ${accessToken}`;
        const authStorage = request.cookies.get("auth-storage")?.value;
        return getBearerFromAuthStorage(authStorage);
      })();
    if (!authHeader) {
      return NextResponse.json(
        { message: "Authorization header is required." },
        { status: 401 },
      );
    }

    const inviteResponse = await fetch(
      `${getBackendBaseUrl()}/api/interviewer-invites`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: authHeader,
        },
        body: JSON.stringify({
          interviewerId: parsedInterviewerId,
          expiresInDays,
        }),
      },
    );

    if (!inviteResponse.ok) {
      const inviteErrorText = await inviteResponse.text();
      return NextResponse.json(
        {
          message: "Failed to create interviewer invite.",
          detail: inviteErrorText,
        },
        { status: inviteResponse.status },
      );
    }

    const inviteData = (await inviteResponse.json()) as InterviewerInviteResponse;
    const inviteUrl = inviteData.inviteUrl ?? inviteData.invite_url ?? "";
    const expiresAt = inviteData.expiresAt ?? inviteData.expires_at ?? null;

    if (!inviteUrl) {
      return NextResponse.json(
        { message: "Invite URL is missing from backend response." },
        { status: 502 },
      );
    }

    const resendApiKey = getRequiredEnv("RESEND_API_KEY");
    const mailFrom = process.env.MAIL_FROM?.trim() ?? process.env.RESEND_FROM?.trim();
    if (!mailFrom) {
      throw new Error("MAIL_FROM or RESEND_FROM is required.");
    }

    const personalizedContent = replaceInviteTokens(content, inviteUrl);
    const emailComponent = createElement(InterviewerInviteEmail, {
      content: personalizedContent,
      inviteUrl,
      expiresAt,
      previewText: buildPreviewText(subject, personalizedContent),
    });

    const [html, text] = await Promise.all([
      render(emailComponent),
      render(emailComponent, { plainText: true }),
    ]);

    const resend = new Resend(resendApiKey);
    const emailResult = await resend.emails.send({
      from: mailFrom,
      to: interviewerEmail,
      subject,
      html,
      text,
    });

    if (emailResult.error) {
      throw new Error(emailResult.error.message);
    }

    return NextResponse.json({
      message: "Interviewer mail sent successfully.",
      invite_url: inviteUrl,
      expires_at: expiresAt,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to send interviewer mail.";
    return NextResponse.json({ message }, { status: 500 });
  }
}
