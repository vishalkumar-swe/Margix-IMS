import { toSkuOption } from "@/lib/options";
import { scanLookupQuerySchema } from "@/lib/validation/scan";
import { assertFound } from "@/server/errors";
import { apiRoute } from "@/server/http/api-route";
import { findSkuByScanCode } from "@/server/modules/masters/masters.queries";

/** Resolves a scanned barcode (or a typed SKU code) to the product, with its status. */
export const GET = apiRoute({ permission: "stock.view", query: scanLookupQuerySchema }, async ({ query }) => {
  const sku = assertFound(await findSkuByScanCode(query.code), "Product", query.code);
  return { ...toSkuOption(sku), status: sku.status };
});
