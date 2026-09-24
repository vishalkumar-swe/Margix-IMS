import { SESSION_ABSOLUTE_LIFETIME_MS, SESSION_COOKIE_NAME } from "./session";

/**
 * Serialises the session cookie: httpOnly (no JS access), SameSite=Lax (not
 * sent on cross-site POSTs) and Secure whenever the request arrived over
 * HTTPS (directly or via a TLS-terminating proxy). Built as a raw header so
 * route handlers stay testable outside the Next.js request scope.
 */
export function buildSessionCookie(request: Request, token: string): string {
  return serialise(token, Math.floor(SESSION_ABSOLUTE_LIFETIME_MS / 1000), isHttps(request));
}

export function buildClearedSessionCookie(request: Request): string {
  return serialise("", 0, isHttps(request));
}

function isHttps(request: Request): boolean {
  const forwarded = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  return forwarded ? forwarded === "https" : new URL(request.url).protocol === "https:";
}

function serialise(value: string, maxAgeSeconds: number, secure: boolean): string {
  const parts = [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(value)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAgeSeconds}`,
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}
