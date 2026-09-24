import { assertFound } from "@/server/errors";
import { apiRoute, uuidParam } from "@/server/http/api-route";
import { getGrnDetail } from "@/server/modules/purchasing/purchasing.queries";

export const GET = apiRoute({ permission: "grn.view" }, async ({ params }) => {
  const id = uuidParam(params, "id", "GRN");
  return assertFound(await getGrnDetail(id), "GRN", id);
});
