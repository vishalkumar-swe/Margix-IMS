import { poCreateSchema, poListQuerySchema } from "@/lib/validation/purchasing";
import { apiRoute } from "@/server/http/api-route";
import { createPurchaseOrder } from "@/server/modules/purchasing/purchase-order.service";
import { listPurchaseOrders } from "@/server/modules/purchasing/purchasing.queries";

export const GET = apiRoute({ permission: "po.view", query: poListQuerySchema }, ({ query }) =>
  listPurchaseOrders(query),
);

export const POST = apiRoute(
  { permission: "po.manage", body: poCreateSchema, successStatus: 201 },
  ({ actor, body }) => createPurchaseOrder(actor, body),
);
