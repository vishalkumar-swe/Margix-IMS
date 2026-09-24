import { dispatchCreateSchema, dispatchListQuerySchema } from "@/lib/validation/dispatch";
import { apiRoute } from "@/server/http/api-route";
import { listDispatches } from "@/server/modules/dispatch/dispatch.queries";
import { postDispatch } from "@/server/modules/dispatch/dispatch.service";

export const GET = apiRoute({ permission: "dispatch.view", query: dispatchListQuerySchema }, ({ query }) =>
  listDispatches(query),
);

export const POST = apiRoute(
  { permission: "dispatch.create", body: dispatchCreateSchema, successStatus: 201 },
  ({ actor, body }) => postDispatch(actor, body),
);
