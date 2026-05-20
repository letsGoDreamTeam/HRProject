import { NextRequest } from "next/server";
import { getBackendBaseUrl } from "@/app/server/http/fetch-backend";
import { guardInterviewerAuth } from "@/app/api/_utils/forward-auth";
import { forwardJsonResponse } from "@/app/api/_utils/forward-response";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const guard = guardInterviewerAuth(request);
  if ("error" in guard) return guard.error;

  const response = await fetch(`${getBackendBaseUrl()}/api/positions`, {
    method: "GET",
    headers: {
      Authorization: guard.authHeader,
    },
    cache: "no-store",
  });

  return forwardJsonResponse(response);
}

