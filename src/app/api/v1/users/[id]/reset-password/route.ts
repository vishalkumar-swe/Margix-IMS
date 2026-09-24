import { passwordResetSchema } from "@/lib/validation/users";
import { apiRoute, uuidParam } from "@/server/http/api-route";
import { resetPassword } from "@/server/modules/users/users.service";

export const POST = apiRoute({ permission: "user.manage", body: passwordResetSchema }, async ({ actor, params, body }) => {
  await resetPassword(actor, uuidParam(params, "id", "User"), body.password);
  return null;
});
