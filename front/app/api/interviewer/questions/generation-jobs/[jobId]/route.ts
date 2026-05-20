import { NextRequest, NextResponse } from "next/server";
import { getBackendBaseUrl } from "@/app/server/http/fetch-backend";
import { guardInterviewerAuth } from "@/app/api/_utils/forward-auth";
import { forwardJsonResponse } from "@/app/api/_utils/forward-response";

export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ jobId: string }> },
) {
  const guard = guardInterviewerAuth(request);
  if ("error" in guard) return guard.error;

  const { jobId } = await context.params;
  const parsedJobId = Number(jobId);
  if (!Number.isInteger(parsedJobId) || parsedJobId <= 0) {
    return NextResponse.json({ message: "Invalid job id." }, { status: 400 });
  }

  const response = await fetch(
    `${getBackendBaseUrl()}/api/interviewer/questions/generation-jobs/${parsedJobId}`,
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

