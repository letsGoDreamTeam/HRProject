import { NextRequest, NextResponse } from "next/server";
import { getBackendBaseUrl } from "@/app/server/http/fetch-backend";
import { guardInterviewerAuth } from "@/app/api/_utils/forward-auth";
import { forwardJsonResponse } from "@/app/api/_utils/forward-response";

type GeneratePayload = {
  candidateId?: number;
  positionId?: number;
  questionCount?: number;
  additionalRequest?: string;
};

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const guard = guardInterviewerAuth(request);
  if ("error" in guard) return guard.error;

  const body = (await request.json()) as GeneratePayload;
  const candidateId = Number(body.candidateId);

  if (!Number.isInteger(candidateId) || candidateId <= 0) {
    return NextResponse.json({ message: "candidateId is required." }, { status: 400 });
  }

  if (body.questionCount != null) {
    const questionCount = Number(body.questionCount);
    if (!Number.isInteger(questionCount) || questionCount <= 0) {
      return NextResponse.json(
        { message: "questionCount must be a positive integer." },
        { status: 400 },
      );
    }
  }

  if (body.positionId != null) {
    const positionId = Number(body.positionId);
    if (!Number.isInteger(positionId) || positionId <= 0) {
      return NextResponse.json(
        { message: "positionId must be a positive integer." },
        { status: 400 },
      );
    }
  }

  const response = await fetch(`${getBackendBaseUrl()}/api/interviewer/questions/generate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: guard.authHeader,
    },
    body: JSON.stringify(body),
  });

  return forwardJsonResponse(response);
}

