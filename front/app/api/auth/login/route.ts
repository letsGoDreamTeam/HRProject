import { NextRequest } from "next/server";
import { getBackendBaseUrl } from "@/app/server/http/fetch-backend";
import { forwardJsonResponse } from "@/app/api/_utils/forward-response";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const body = await request.text();
  const response = await fetch(`${getBackendBaseUrl()}/api/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body,
  });

  return forwardJsonResponse(response);
}

