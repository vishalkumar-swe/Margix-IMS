import { adjustmentApproveSchema } from "@/lib/validation/adjustments";
import { apiRoute, uuidParam } from "@/server/http/api-route";
import { approveAdjustment } from "@/server/modules/adjustments/adjustments.service";

export const POST = apiRoute(
  { permission: "adjustment.approve", body: adjustmentApproveSchema },
  ({ actor, params, body }) => approveAdjustment(actor, uuidParam(params, "id", "Adjustment"), body.note),
);
