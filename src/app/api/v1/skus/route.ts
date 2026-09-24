import { skuCreateSchema, skuListQuerySchema } from "@/lib/validation/masters";
import { apiRoute } from "@/server/http/api-route";
import { listSkus } from "@/server/modules/masters/masters.queries";
import { createSku } from "@/server/modules/masters/masters.service";

export const GET = apiRoute({ permission: "master.view", query: skuListQuerySchema }, ({ query }) => listSkus(query));

export const POST = apiRoute(
  { permission: "master.manage", body: skuCreateSchema, successStatus: 201 },
  ({ actor, body }) => createSku(actor, body),
);
