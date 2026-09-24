import { hsnImportSchema } from "@/lib/validation/imports";
import { apiRoute } from "@/server/http/api-route";
import { importHsnCodes } from "@/server/modules/imports/import.service";

export const POST = apiRoute(
  { permission: "master.manage", body: hsnImportSchema, successStatus: 201 },
  ({ actor, body }) => importHsnCodes(actor, body.csv),
);
