import { grnCreateSchema } from "@/lib/validation/purchasing";
import { apiRoute, uuidParam } from "@/server/http/api-route";
import { postGrn } from "@/server/modules/purchasing/grn.service";

export const POST = apiRoute(
  { permission: "grn.create", body: grnCreateSchema, successStatus: 201 },
  ({ actor, params, body }) => postGrn(actor, uuidParam(params, "id", "Purchase order"), body),
);
