import { activeOnlyQuerySchema, categoryCreateSchema } from "@/lib/validation/masters";
import { apiRoute } from "@/server/http/api-route";
import { listCategories } from "@/server/modules/masters/masters.queries";
import { createCategory } from "@/server/modules/masters/masters.service";

export const GET = apiRoute({ permission: "master.view", query: activeOnlyQuerySchema }, ({ query }) =>
  listCategories(query),
);

export const POST = apiRoute(
  { permission: "master.manage", body: categoryCreateSchema, successStatus: 201 },
  ({ actor, body }) => createCategory(actor, body),
);
