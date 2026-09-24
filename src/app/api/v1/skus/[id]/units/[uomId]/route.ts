import { apiRoute, uuidParam } from "@/server/http/api-route";
import { removeSkuUnit } from "@/server/modules/masters/masters.service";

export const DELETE = apiRoute({ permission: "master.manage" }, async ({ actor, params }) => {
  await removeSkuUnit(actor, uuidParam(params, "id", "SKU"), uuidParam(params, "uomId", "Unit"));
  return { removed: true };
});
