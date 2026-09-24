import { loginSchema } from "@/lib/validation/auth";
import { login } from "@/server/auth/auth.service";
import { buildSessionCookie } from "@/server/auth/session-cookie";
import { jsonSuccess } from "@/server/http/api-response";
import { publicApiRoute } from "@/server/http/api-route";

export const POST = publicApiRoute({ body: loginSchema }, async ({ request, body, meta }) => {
  const result = await login(body.email, body.password, meta);
  return jsonSuccess({ user: result.user, expiresAt: result.expiresAt }, 200, {
    "set-cookie": buildSessionCookie(request, result.token),
  });
});
