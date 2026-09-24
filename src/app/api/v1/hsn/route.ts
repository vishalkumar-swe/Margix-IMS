import { hsnCreateSchema, hsnListQuerySchema } from "@/lib/validation/hsn";
import { apiRoute } from "@/server/http/api-route";
import { listHsnCodes } from "@/server/modules/hsn/hsn.queries";
import { createHsnCode } from "@/server/modules/hsn/hsn.service";

export const GET = apiRoute({ permission: "master.view", query: hsnListQuerySchema }, ({ query }) => listHsnCodes(query));

export const POST = apiRoute(
  { permission: "master.manage", body: hsnCreateSchema, successStatus: 201 },
  ({ actor, body }) => createHsnCode(actor, body),
);
