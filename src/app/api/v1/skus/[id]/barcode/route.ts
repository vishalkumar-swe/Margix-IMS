import { skuBarcodeGenerateSchema } from "@/lib/validation/masters";
import { apiRoute, uuidParam } from "@/server/http/api-route";
import { generateSkuBarcode } from "@/server/modules/masters/masters.service";

/** Gives the SKU a generated internal EAN-13 (replacing an existing barcode only with `replace`). */
export const POST = apiRoute({ permission: "master.manage", body: skuBarcodeGenerateSchema }, ({ actor, params, body }) =>
  generateSkuBarcode(actor, uuidParam(params, "id", "SKU"), body),
);
