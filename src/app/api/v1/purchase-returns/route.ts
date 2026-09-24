import { purchaseReturnCreateSchema, returnListQuerySchema } from "@/lib/validation/returns";
import { apiRoute } from "@/server/http/api-route";
import { postPurchaseReturn } from "@/server/modules/returns/purchase-return.service";
import { listPurchaseReturns } from "@/server/modules/returns/returns.queries";

export const GET = apiRoute({ permission: "return.view", query: returnListQuerySchema }, ({ query }) =>
  listPurchaseReturns(query),
);

export const POST = apiRoute(
  { permission: "return.create", body: purchaseReturnCreateSchema, successStatus: 201 },
  ({ actor, body }) => postPurchaseReturn(actor, body),
);
