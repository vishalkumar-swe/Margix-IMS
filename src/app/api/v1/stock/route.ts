import { stockListQuerySchema } from "@/lib/validation/stock";
import { apiRoute } from "@/server/http/api-route";
import { listStockBalances } from "@/server/modules/inventory/stock.queries";

export const GET = apiRoute({ permission: "stock.view", query: stockListQuerySchema }, ({ query }) =>
  listStockBalances(query),
);
