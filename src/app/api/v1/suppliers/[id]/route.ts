import { partyUpdateSchema } from "@/lib/validation/masters";
import { apiRoute, uuidParam } from "@/server/http/api-route";
import { updateSupplier } from "@/server/modules/masters/masters.service";

export const PATCH = apiRoute({ permission: "master.manage", body: partyUpdateSchema }, ({ actor, params, body }) =>
  updateSupplier(actor, uuidParam(params, "id", "Supplier"), body),
);
