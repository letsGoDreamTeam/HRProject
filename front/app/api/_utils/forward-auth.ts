import { NextRequest, NextResponse } from "next/server";

type JwtPayload = {
  token_type?: string;
  role?: string;
  exp?: number;
};

function parseAuthStorageToken(raw: string | undefined): string | null {
  if (!raw) return null;

  const candidates = [raw];
  try {
    candidates.push(decodeURIComponent(raw));
  } catch {
    // ignore
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as { state?: { token?: string | null } };
      const token = parsed?.state?.token?.trim();
      if (token) return token;
    } catch {
      // ignore
    }
  }

  return null;
}

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

export function resolveAuthHeader(request: NextRequest): string | null {
  const direct = request.headers.get("authorization")?.trim();
  if (direct) return direct;

  const cookieToken = request.cookies.get("accessToken")?.value?.trim();
  if (cookieToken) return `Bearer ${cookieToken}`;

  const authStorageToken = parseAuthStorageToken(
    request.cookies.get("auth-storage")?.value,
  );
  if (authStorageToken) return `Bearer ${authStorageToken}`;

  return null;
}

export function guardInterviewerAuth(request: NextRequest): {
  authHeader: string;
} | {
  error: NextResponse;
} {
  const authHeader = resolveAuthHeader(request);
  if (!authHeader) {
    return {
      error: NextResponse.json(
        { message: "Authorization header is required." },
        { status: 401 },
      ),
    };
  }

  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  const payload = decodeJwtPayload(token);
  if (!payload) {
    return {
      error: NextResponse.json({ message: "Invalid token." }, { status: 401 }),
    };
  }

  if (isExpired(payload)) {
    return {
      error: NextResponse.json({ message: "Token expired." }, { status: 401 }),
    };
  }

  if (payload.token_type !== "interviewer_access" || payload.role !== "interviewer") {
    return {
      error: NextResponse.json(
        { message: "Invalid interviewer token." },
        { status: 403 },
      ),
    };
  }

  return { authHeader };
}

export function guardUserAuth(
  request: NextRequest,
  allowedRoles?: string[],
): { authHeader: string } | { error: NextResponse } {
  const authHeader = resolveAuthHeader(request);
  if (!authHeader) {
    return {
      error: NextResponse.json(
        { message: "Authorization header is required." },
        { status: 401 },
      ),
    };
  }

  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  const payload = decodeJwtPayload(token);
  if (!payload) {
    return {
      error: NextResponse.json({ message: "Invalid token." }, { status: 401 }),
    };
  }

  if (isExpired(payload)) {
    return {
      error: NextResponse.json({ message: "Token expired." }, { status: 401 }),
    };
  }

  if (payload.token_type !== "user_access") {
    return {
      error: NextResponse.json({ message: "Invalid user token." }, { status: 403 }),
    };
  }

  if (allowedRoles && allowedRoles.length > 0) {
    if (!payload.role || !allowedRoles.includes(payload.role)) {
      return {
        error: NextResponse.json({ message: "Permission denied." }, { status: 403 }),
      };
    }
  }

  return { authHeader };
}
