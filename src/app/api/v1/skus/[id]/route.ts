import { skuUpdateSchema } from "@/lib/validation/masters";
import { assertFound } from "@/server/errors";
import { apiRoute, uuidParam } from "@/server/http/api-route";
import { getSku } from "@/server/modules/masters/masters.queries";
import { updateSku } from "@/server/modules/masters/masters.service";

export const GET = apiRoute({ permission: "master.view" }, async ({ params }) => {
  const id = uuidParam(params, "id", "SKU");
  return assertFound(await getSku(id), "SKU", id);
});

export const PATCH = apiRoute({ permission: "master.manage", body: skuUpdateSchema }, ({ actor, params, body }) =>
  updateSku(actor, uuidParam(params, "id", "SKU"), body),
);
