import { assertFound } from "@/server/errors";
import { apiRoute, uuidParam } from "@/server/http/api-route";
import { getSkuStock } from "@/server/modules/inventory/stock.queries";
import { getSku } from "@/server/modules/masters/masters.queries";

export const GET = apiRoute({ permission: "stock.view" }, async ({ params }) => {
  const skuId = uuidParam(params, "skuId", "SKU");
  const sku = assertFound(await getSku(skuId), "SKU", skuId);
  return { sku, ...(await getSkuStock(skuId)) };
});
