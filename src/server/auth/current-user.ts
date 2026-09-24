import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { can, type Permission } from "@/lib/permissions";
import { SESSION_COOKIE_NAME, validateSessionToken, type SessionUser } from "./session";

/**
 * The signed-in user for the current request (Server Components). Memoised per
 * request with React `cache`. Reading cookies makes the route dynamic, so
 * authenticated pages are always rendered at request time.
 */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  return token ? validateSessionToken(token) : null;
});

/** For pages: redirects to /login when signed out. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/** For pages: redirects to the dashboard when the user lacks the permission. */
export async function requirePagePermission(permission: Permission): Promise<SessionUser> {
  const user = await requireUser();
  if (!can(user.role, permission)) redirect("/?denied=1");
  return user;
}
