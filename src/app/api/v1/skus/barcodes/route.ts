import { apiRoute } from "@/server/http/api-route";
import { generateMissingSkuBarcodes } from "@/server/modules/masters/masters.service";

/** Generates internal EAN-13 barcodes for every product that has none. */
export const POST = apiRoute({ permission: "master.manage" }, ({ actor }) => generateMissingSkuBarcodes(actor));
