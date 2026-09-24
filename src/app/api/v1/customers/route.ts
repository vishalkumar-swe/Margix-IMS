import { activeOnlyQuerySchema, partyCreateSchema } from "@/lib/validation/masters";
import { apiRoute } from "@/server/http/api-route";
import { listCustomers } from "@/server/modules/masters/masters.queries";
import { createCustomer } from "@/server/modules/masters/masters.service";

export const GET = apiRoute({ permission: "master.view", query: activeOnlyQuerySchema }, ({ query }) =>
  listCustomers(query),
);

export const POST = apiRoute(
  { permission: "master.manage", body: partyCreateSchema, successStatus: 201 },
  ({ actor, body }) => createCustomer(actor, body),
);
