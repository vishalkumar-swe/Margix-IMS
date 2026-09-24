import { skuImportSchema } from "@/lib/validation/imports";
import { apiRoute } from "@/server/http/api-route";
import { importSkus } from "@/server/modules/imports/import.service";

export const POST = apiRoute(
  { permission: "master.manage", body: skuImportSchema, successStatus: 201 },
  ({ actor, body }) => importSkus(actor, body.csv),
);
