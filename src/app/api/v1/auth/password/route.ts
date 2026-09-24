import { passwordChangeSchema } from "@/lib/validation/users";
import { changeOwnPassword } from "@/server/auth/auth.service";
import { readSessionToken } from "@/server/auth/session";
import { apiRoute } from "@/server/http/api-route";

/** Changes the signed-in user's own password; other sessions are signed out. */
export const POST = apiRoute({ body: passwordChangeSchema }, async ({ request, user, body, meta }) => {
  const token = readSessionToken(request.headers.get("cookie"))!;
  await changeOwnPassword(user, token, body.currentPassword, body.newPassword, meta);
  return null;
});
