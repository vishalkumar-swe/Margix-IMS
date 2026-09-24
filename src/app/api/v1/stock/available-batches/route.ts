import { availableBatchesQuerySchema } from "@/lib/validation/stock";
import { apiRoute } from "@/server/http/api-route";
import { listAvailableBatches } from "@/server/modules/inventory/stock.queries";

export const GET = apiRoute({ permission: "stock.view", query: availableBatchesQuerySchema }, ({ query }) =>
  listAvailableBatches(query.skuId, query.godownId),
);
