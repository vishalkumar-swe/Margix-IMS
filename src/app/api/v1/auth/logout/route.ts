import { logout } from "@/server/auth/auth.service";
import { readSessionToken, validateSessionToken } from "@/server/auth/session";
import { buildClearedSessionCookie } from "@/server/auth/session-cookie";
import { jsonSuccess } from "@/server/http/api-response";
import { publicApiRoute } from "@/server/http/api-route";

/** Public so that an expired session can still clear its cookie. */
export const POST = publicApiRoute({}, async ({ request, meta }) => {
  const token = readSessionToken(request.headers.get("cookie"));
  if (token) {
    const user = await validateSessionToken(token);
    await logout(token, user, meta);
  }
  return jsonSuccess(null, 200, { "set-cookie": buildClearedSessionCookie(request) });
});
