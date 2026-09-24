import { skuUnitSchema } from "@/lib/validation/masters";
import { apiRoute, uuidParam } from "@/server/http/api-route";
import { setSkuUnit } from "@/server/modules/masters/masters.service";

/** Adds an alternate unit to the SKU, or updates its factor. */
export const POST = apiRoute({ permission: "master.manage", body: skuUnitSchema }, ({ actor, params, body }) =>
  setSkuUnit(actor, uuidParam(params, "id", "SKU"), body),
);
