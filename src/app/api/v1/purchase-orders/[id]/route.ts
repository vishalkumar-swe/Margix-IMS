import { poUpdateSchema } from "@/lib/validation/purchasing";
import { assertFound } from "@/server/errors";
import { apiRoute, uuidParam } from "@/server/http/api-route";
import { updateDraftPurchaseOrder } from "@/server/modules/purchasing/purchase-order.service";
import { getPurchaseOrderDetail } from "@/server/modules/purchasing/purchasing.queries";

export const GET = apiRoute({ permission: "po.view" }, async ({ params }) => {
  const id = uuidParam(params, "id", "Purchase order");
  return assertFound(await getPurchaseOrderDetail(id), "Purchase order", id);
});

export const PATCH = apiRoute({ permission: "po.manage", body: poUpdateSchema }, ({ actor, params, body }) =>
  updateDraftPurchaseOrder(actor, uuidParam(params, "id", "Purchase order"), body),
);
