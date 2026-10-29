import { barcodeLookupQuerySchema } from "@/lib/validation/masters";
import { apiRoute } from "@/server/http/api-route";
import { lookupBarcodeDetails } from "@/server/modules/masters/barcode-lookup.service";

/**
 * Resolves a scanned or typed barcode:
 * 1. Returns existing SKU if already registered in Margix database.
 * 2. If new, queries open product registries and AI to auto-detect product name, category, UOM, HSN, and GST.
 */
export const GET = apiRoute({ query: barcodeLookupQuerySchema }, async ({ query }) => {
  const code = query.barcode || query.code || "";
  return lookupBarcodeDetails(code);
});

