import { adjustmentCreateSchema, adjustmentListQuerySchema } from "@/lib/validation/adjustments";
import { apiRoute } from "@/server/http/api-route";
import { listAdjustments } from "@/server/modules/adjustments/adjustments.queries";
import { createAdjustment } from "@/server/modules/adjustments/adjustments.service";

export const GET = apiRoute({ permission: "adjustment.view", query: adjustmentListQuerySchema }, ({ query }) =>
  listAdjustments(query),
);

export const POST = apiRoute(
  { permission: "adjustment.request", body: adjustmentCreateSchema, successStatus: 201 },
  ({ actor, body }) => createAdjustment(actor, body),
);
