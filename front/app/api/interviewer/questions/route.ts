import { NextRequest, NextResponse } from "next/server";
import { getBackendBaseUrl } from "@/app/server/http/fetch-backend";
import { guardInterviewerAuth } from "@/app/api/_utils/forward-auth";
import { forwardJsonResponse } from "@/app/api/_utils/forward-response";

type SaveQuestionsPayload = {
  positionId?: number;
  candidateId?: number;
  generationJobId?: number;
  questions?: Array<{
    questionText?: string;
    questionType?: string;
    evaluationIntent?: string;
    generationBasis?: string;
    candidateId?: number;
    positionId?: number;
    generationJobId?: number;
  }>;
};

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const guard = guardInterviewerAuth(request);
  if ("error" in guard) return guard.error;

  const candidateIdRaw = request.nextUrl.searchParams.get("candidateId");
  if (candidateIdRaw != null) {
    const candidateId = Number(candidateIdRaw);
    if (!Number.isInteger(candidateId) || candidateId <= 0) {
      return NextResponse.json(
        { message: "candidateId must be a positive integer." },
        { status: 400 },
      );
    }
  }

  const response = await fetch(
    `${getBackendBaseUrl()}/api/interviewer/questions${request.nextUrl.search}`,
    {
      method: "GET",
      headers: {
        Authorization: guard.authHeader,
      },
      cache: "no-store",
    },
  );

  return forwardJsonResponse(response);
}

export async function POST(request: NextRequest) {
  const guard = guardInterviewerAuth(request);
  if ("error" in guard) return guard.error;

  const body = (await request.json()) as SaveQuestionsPayload;
  if (!Array.isArray(body.questions) || body.questions.length === 0) {
    return NextResponse.json(
      { message: "questions must contain at least one item." },
      { status: 400 },
    );
  }

  const hasInvalidQuestion = body.questions.some(
    (question) => !question?.questionText || !question.questionText.trim(),
  );
  if (hasInvalidQuestion) {
    return NextResponse.json(
      { message: "questions[].questionText is required." },
      { status: 400 },
    );
  }

  const response = await fetch(`${getBackendBaseUrl()}/api/interviewer/questions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: guard.authHeader,
    },
    body: JSON.stringify(body),
  });

  return forwardJsonResponse(response);
}

