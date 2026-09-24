import { openingImportSchema } from "@/lib/validation/imports";
import { apiRoute } from "@/server/http/api-route";
import { importOpeningStock } from "@/server/modules/imports/import.service";

export const POST = apiRoute(
  { permission: "opening.post", body: openingImportSchema, successStatus: 201 },
  ({ actor, body }) => importOpeningStock(actor, body.csv, body.asOf),
);
