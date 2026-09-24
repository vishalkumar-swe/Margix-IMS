import { assertFound } from "@/server/errors";
import { apiRoute, uuidParam } from "@/server/http/api-route";
import { getDispatchDetail } from "@/server/modules/dispatch/dispatch.queries";

export const GET = apiRoute({ permission: "dispatch.view" }, async ({ params }) => {
  const id = uuidParam(params, "id", "Dispatch");
  return assertFound(await getDispatchDetail(id), "Dispatch", id);
});
