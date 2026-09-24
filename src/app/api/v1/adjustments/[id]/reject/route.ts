import { adjustmentRejectSchema } from "@/lib/validation/adjustments";
import { apiRoute, uuidParam } from "@/server/http/api-route";
import { rejectAdjustment } from "@/server/modules/adjustments/adjustments.service";

export const POST = apiRoute(
  { permission: "adjustment.approve", body: adjustmentRejectSchema },
  ({ actor, params, body }) => rejectAdjustment(actor, uuidParam(params, "id", "Adjustment"), body.note),
);
