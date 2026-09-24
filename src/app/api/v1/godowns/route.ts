import { activeOnlyQuerySchema, godownCreateSchema } from "@/lib/validation/masters";
import { apiRoute } from "@/server/http/api-route";
import { listGodowns } from "@/server/modules/masters/masters.queries";
import { createGodown } from "@/server/modules/masters/masters.service";

export const GET = apiRoute({ permission: "master.view", query: activeOnlyQuerySchema }, ({ query }) =>
  listGodowns(query),
);

export const POST = apiRoute(
  { permission: "master.manage", body: godownCreateSchema, successStatus: 201 },
  ({ actor, body }) => createGodown(actor, body),
);
