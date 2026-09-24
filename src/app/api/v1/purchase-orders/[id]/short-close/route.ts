import { poShortCloseSchema } from "@/lib/validation/purchasing";
import { apiRoute, uuidParam } from "@/server/http/api-route";
import { shortClosePurchaseOrder } from "@/server/modules/purchasing/purchase-order.service";

export const POST = apiRoute({ permission: "po.manage", body: poShortCloseSchema }, ({ actor, params, body }) =>
  shortClosePurchaseOrder(actor, uuidParam(params, "id", "Purchase order"), body.reason),
);
