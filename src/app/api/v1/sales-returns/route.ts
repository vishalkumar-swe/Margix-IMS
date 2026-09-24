import { returnListQuerySchema, salesReturnCreateSchema } from "@/lib/validation/returns";
import { apiRoute } from "@/server/http/api-route";
import { listSalesReturns } from "@/server/modules/returns/returns.queries";
import { postSalesReturn } from "@/server/modules/returns/sales-return.service";

export const GET = apiRoute({ permission: "return.view", query: returnListQuerySchema }, ({ query }) =>
  listSalesReturns(query),
);

export const POST = apiRoute(
  { permission: "return.create", body: salesReturnCreateSchema, successStatus: 201 },
  ({ actor, body }) => postSalesReturn(actor, body),
);
