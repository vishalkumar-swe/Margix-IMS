import { apiRoute, uuidParam } from "@/server/http/api-route";
import { submitPurchaseOrder } from "@/server/modules/purchasing/purchase-order.service";

export const POST = apiRoute({ permission: "po.manage" }, ({ actor, params }) =>
  submitPurchaseOrder(actor, uuidParam(params, "id", "Purchase order")),
);
