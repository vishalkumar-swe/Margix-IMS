import { assertFound } from "@/server/errors";
import { apiRoute, uuidParam } from "@/server/http/api-route";
import { getSalesReturnDetail } from "@/server/modules/returns/returns.queries";

export const GET = apiRoute({ permission: "return.view" }, async ({ params }) => {
  const id = uuidParam(params, "id", "Customer return");
  return assertFound(await getSalesReturnDetail(id), "Customer return", id);
});
