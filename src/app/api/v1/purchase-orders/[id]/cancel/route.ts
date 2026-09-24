import { poCancelSchema } from "@/lib/validation/purchasing";
import { apiRoute, uuidParam } from "@/server/http/api-route";
import { cancelPurchaseOrder } from "@/server/modules/purchasing/purchase-order.service";

export const POST = apiRoute({ permission: "po.manage", body: poCancelSchema }, ({ actor, params, body }) =>
  cancelPurchaseOrder(actor, uuidParam(params, "id", "Purchase order"), body.reason),
);
