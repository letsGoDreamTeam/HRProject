import { NextRequest, NextResponse } from "next/server";
import { getBackendBaseUrl } from "@/app/server/http/fetch-backend";
import { resolveAuthHeader } from "@/app/api/_utils/forward-auth";
import { forwardJsonResponse } from "@/app/api/_utils/forward-response";
import { isPublicPath, requiresPolicy } from "@/app/api/_utils/forward-policy";

type JwtPayload = {
  token_type?: string;
  role?: string;
  exp?: number;
};

function decodeJwtPayload(token: string): JwtPayload | null {
  const parts = token.split(".");
  if (parts.length < 2) return null;

  try {
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
    const json = Buffer.from(padded, "base64").toString("utf8");
    return JSON.parse(json) as JwtPayload;
  } catch {
    return null;
  }
}

function isExpired(payload: JwtPayload): boolean {
  if (!payload.exp) return false;
  return payload.exp * 1000 <= Date.now();
}

function validateRole(pathname: string, payload: JwtPayload): NextResponse | null {
  if (requiresPolicy(pathname, "interviewer")) {
    if (payload.token_type !== "interviewer_access" || payload.role !== "interviewer") {
      return NextResponse.json({ message: "Invalid interviewer token." }, { status: 403 });
    }
    return null;
  }

  if (payload.token_type !== "user_access") {
    return NextResponse.json({ message: "Invalid user token." }, { status: 403 });
  }

  if (requiresPolicy(pathname, "admin") && payload.role !== "admin") {
    return NextResponse.json({ message: "Admin role required." }, { status: 403 });
  }

  if (requiresPolicy(pathname, "hr") && payload.role !== "hr" && payload.role !== "admin") {
    return NextResponse.json({ message: "HR role required." }, { status: 403 });
  }

  if (requiresPolicy(pathname, "user") && !payload.role) {
    return NextResponse.json({ message: "Invalid user token." }, { status: 403 });
  }

  return null;
}

async function forward(request: NextRequest, method: string, path: string[]) {
  const pathname = `api/${path.join("/")}`;

  // Let concrete route handlers handle their own policies.
  if (
    pathname.startsWith("api/interviewer/questions") ||
    pathname.startsWith("api/interviewer/positions") ||
    pathname.startsWith("api/interviewer/candidates") ||
    pathname.startsWith("api/interviewers/") && pathname.endsWith("/email")
  ) {
    return NextResponse.json({ message: "Route should be handled by dedicated handler." }, { status: 404 });
  }

  if (!isPublicPath(pathname)) {
    const authHeader = resolveAuthHeader(request);
    if (!authHeader) {
      return NextResponse.json(
        { message: "Authorization header is required." },
        { status: 401 },
      );
    }

    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    const payload = decodeJwtPayload(token);
    if (!payload) {
      return NextResponse.json({ message: "Invalid token." }, { status: 401 });
    }
    if (isExpired(payload)) {
      return NextResponse.json({ message: "Token expired." }, { status: 401 });
    }

    const roleError = validateRole(pathname, payload);
    if (roleError) return roleError;
  }

  const targetUrl = `${getBackendBaseUrl()}/${pathname}${request.nextUrl.search}`;
  const headers = new Headers();
  const authHeader = resolveAuthHeader(request);
  if (authHeader) headers.set("Authorization", authHeader);
  if (request.headers.get("content-type")) {
    headers.set("Content-Type", request.headers.get("content-type") as string);
  }

  const response = await fetch(targetUrl, {
    method,
    headers,
    body: method === "GET" || method === "HEAD" ? undefined : await request.text(),
    cache: "no-store",
  });

  return forwardJsonResponse(response);
}

export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  const { path } = await context.params;
  return forward(request, "GET", path);
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  const { path } = await context.params;
  return forward(request, "POST", path);
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  const { path } = await context.params;
  return forward(request, "PATCH", path);
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  const { path } = await context.params;
  return forward(request, "PUT", path);
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  const { path } = await context.params;
  return forward(request, "DELETE", path);
}

export async function OPTIONS(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  const { path } = await context.params;
  return forward(request, "OPTIONS", path);
}
