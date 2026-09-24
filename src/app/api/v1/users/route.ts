import { userCreateSchema } from "@/lib/validation/users";
import { apiRoute } from "@/server/http/api-route";
import { listUsers } from "@/server/modules/users/users.queries";
import { createUser } from "@/server/modules/users/users.service";

export const GET = apiRoute({ permission: "user.manage" }, () => listUsers());

export const POST = apiRoute(
  { permission: "user.manage", body: userCreateSchema, successStatus: 201 },
  ({ actor, body }) => createUser(actor, body),
);
