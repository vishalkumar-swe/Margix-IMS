import { batchListQuerySchema } from "@/lib/validation/masters";
import { apiRoute } from "@/server/http/api-route";
import { listBatchesForSku } from "@/server/modules/inventory/stock.queries";

export const GET = apiRoute({ permission: "stock.view", query: batchListQuerySchema }, ({ query }) =>
  listBatchesForSku(query.skuId),
);
