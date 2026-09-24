import { assertFound } from "@/server/errors";
import { apiRoute, uuidParam } from "@/server/http/api-route";
import { getPurchaseReturnDetail } from "@/server/modules/returns/returns.queries";

export const GET = apiRoute({ permission: "return.view" }, async ({ params }) => {
  const id = uuidParam(params, "id", "Supplier return");
  return assertFound(await getPurchaseReturnDetail(id), "Supplier return", id);
});
