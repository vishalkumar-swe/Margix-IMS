import { NextResponse, type NextRequest } from "next/server";

/**
 * Optimistic auth gate (Next 16 "proxy"). It only checks that a session cookie
 * is present — no database access, per the Next.js guidance. Real
 * authentication and authorization happen in every page and API route.
 *
 * The cookie name is duplicated from server/auth/session.ts on purpose: proxy
 * runs separately from the app and must not import server modules.
 */
const SESSION_COOKIE_NAME = "margix_session";
const PUBLIC_PATHS = new Set(["/login", "/api/v1/auth/login", "/api/v1/auth/logout", "/api/health", "/api/ready"]);

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const hasSession = Boolean(request.cookies.get(SESSION_COOKIE_NAME)?.value);

  if (PUBLIC_PATHS.has(pathname)) {
    if (pathname === "/login" && hasSession) {
      return NextResponse.redirect(new URL("/", request.url));
    }
    return NextResponse.next();
  }

  if (hasSession) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json(
      { success: false, error: { code: "UNAUTHENTICATED", message: "Authentication required.", details: null } },
      { status: 401 },
    );
  }

  const loginUrl = new URL("/login", request.url);
  if (pathname !== "/") loginUrl.searchParams.set("next", `${pathname}${search}`);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
