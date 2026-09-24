import { uomCreateSchema } from "@/lib/validation/masters";
import { apiRoute } from "@/server/http/api-route";
import { listUoms } from "@/server/modules/masters/masters.queries";
import { createUom } from "@/server/modules/masters/masters.service";

export const GET = apiRoute({ permission: "master.view" }, () => listUoms());

export const POST = apiRoute(
  { permission: "master.manage", body: uomCreateSchema, successStatus: 201 },
  ({ actor, body }) => createUom(actor, body),
);
