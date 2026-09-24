import { godownUpdateSchema } from "@/lib/validation/masters";
import { apiRoute, uuidParam } from "@/server/http/api-route";
import { updateGodown } from "@/server/modules/masters/masters.service";

export const PATCH = apiRoute({ permission: "master.manage", body: godownUpdateSchema }, ({ actor, params, body }) =>
  updateGodown(actor, uuidParam(params, "id", "Godown"), body),
);
