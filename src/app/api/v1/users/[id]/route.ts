import { userUpdateSchema } from "@/lib/validation/users";
import { apiRoute, uuidParam } from "@/server/http/api-route";
import { updateUser } from "@/server/modules/users/users.service";

export const PATCH = apiRoute({ permission: "user.manage", body: userUpdateSchema }, ({ actor, params, body }) =>
  updateUser(actor, uuidParam(params, "id", "User"), body),
);
