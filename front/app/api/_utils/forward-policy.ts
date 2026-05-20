export type RouteRolePolicy = "admin" | "hr" | "interviewer" | "user";

export const PUBLIC_EXACT_PATHS = new Set([
  "api/auth/login",
  "api/auth/signup",
  "api/users/email-availability",
  "api/interviewer-invites/accept",
]);

export const PUBLIC_REGEX_PATHS: RegExp[] = [
  /^api\/email-templates(?:\/.*)?$/,
  /^api\/interviewer-invites\/[^/]+\/availability$/,
  /^api\/interview-booking-invitations\/[^/]+\/available-slots$/,
  /^api\/interview-booking-invitations\/[^/]+\/bookings$/,
];

export const POLICY_PREFIXES: Record<RouteRolePolicy, string[]> = {
  admin: ["api/admin/"],
  hr: [
    "api/hr/",
    "api/interviewers",
    "api/interviewer-invites",
    "api/mail-send/",
    "api/interview-booking-invitations",
    "api/interview-slots",
    "api/interview-bookings",
    "api/interviews",
    "api/questions",
    "api/positions",
  ],
  interviewer: ["api/interviewer/"],
  user: [
    "api/candidates",
    "api/auth/me",
    "api/users/me",
    "api/users/me/password",
    "api/resume-parser",
  ],
};

export function isPublicPath(pathname: string): boolean {
  if (PUBLIC_EXACT_PATHS.has(pathname)) return true;
  return PUBLIC_REGEX_PATHS.some((pattern) => pattern.test(pathname));
}

export function requiresPolicy(pathname: string, policy: RouteRolePolicy): boolean {
  return POLICY_PREFIXES[policy].some((prefix) => pathname.startsWith(prefix));
}

