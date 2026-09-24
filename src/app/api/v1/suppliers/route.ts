import { activeOnlyQuerySchema, partyCreateSchema } from "@/lib/validation/masters";
import { apiRoute } from "@/server/http/api-route";
import { listSuppliers } from "@/server/modules/masters/masters.queries";
import { createSupplier } from "@/server/modules/masters/masters.service";

export const GET = apiRoute({ permission: "master.view", query: activeOnlyQuerySchema }, ({ query }) =>
  listSuppliers(query),
);

export const POST = apiRoute(
  { permission: "master.manage", body: partyCreateSchema, successStatus: 201 },
  ({ actor, body }) => createSupplier(actor, body),
);
