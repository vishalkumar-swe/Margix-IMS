import { assertFound } from "@/server/errors";
import { apiRoute, uuidParam } from "@/server/http/api-route";
import { getTransferDetail } from "@/server/modules/transfers/transfer.queries";

export const GET = apiRoute({ permission: "transfer.view" }, async ({ params }) => {
  const id = uuidParam(params, "id", "Transfer");
  return assertFound(await getTransferDetail(id), "Transfer", id);
});
