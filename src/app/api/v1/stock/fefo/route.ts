import { fefoQuerySchema } from "@/lib/validation/stock";
import { toDecimal } from "@/server/db/decimal";
import { apiRoute } from "@/server/http/api-route";
import { suggestFefoPick } from "@/server/modules/inventory/stock.queries";

/** Suggests which batches to pick for a quantity, earliest expiry first. */
export const GET = apiRoute({ permission: "stock.view", query: fefoQuerySchema }, ({ query }) =>
  suggestFefoPick(query.skuId, query.godownId, toDecimal(query.quantity)),
);
