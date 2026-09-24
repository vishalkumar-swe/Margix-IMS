import { assertFound } from "@/server/errors";
import { apiRoute, uuidParam } from "@/server/http/api-route";
import { getAdjustmentDetail } from "@/server/modules/adjustments/adjustments.queries";

export const GET = apiRoute({ permission: "adjustment.view" }, async ({ params }) => {
  const id = uuidParam(params, "id", "Adjustment");
  return assertFound(await getAdjustmentDetail(id), "Adjustment", id);
});
