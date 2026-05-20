import { NextRequest } from "next/server";
import { getBackendBaseUrl } from "@/app/server/http/fetch-backend";
import { forwardJsonResponse } from "@/app/api/_utils/forward-response";
import { guardUserAuth } from "@/app/api/_utils/forward-auth";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const guard = guardUserAuth(request);
  if ("error" in guard) return guard.error;

  const response = await fetch(`${getBackendBaseUrl()}/api/auth/me`, {
    method: "GET",
    headers: {
      Authorization: guard.authHeader,
    },
    cache: "no-store",
  });

  return forwardJsonResponse(response);
}

