import { NextRequest } from "next/server";
import { getBackendBaseUrl } from "@/app/server/http/fetch-backend";
import { forwardJsonResponse } from "@/app/api/_utils/forward-response";
import { guardUserAuth } from "@/app/api/_utils/forward-auth";

export const runtime = "nodejs";

export async function PATCH(request: NextRequest) {
  const guard = guardUserAuth(request);
  if ("error" in guard) return guard.error;

  const body = await request.text();
  const response = await fetch(`${getBackendBaseUrl()}/api/users/me/password`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: guard.authHeader,
    },
    body,
  });

  return forwardJsonResponse(response);
}

