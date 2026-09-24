import { partyUpdateSchema } from "@/lib/validation/masters";
import { apiRoute, uuidParam } from "@/server/http/api-route";
import { updateCustomer } from "@/server/modules/masters/masters.service";

export const PATCH = apiRoute({ permission: "master.manage", body: partyUpdateSchema }, ({ actor, params, body }) =>
  updateCustomer(actor, uuidParam(params, "id", "Customer"), body),
);
