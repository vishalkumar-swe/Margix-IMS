import { openingLineCorrectionSchema } from "@/lib/validation/opening";
import { apiRoute, uuidParam } from "@/server/http/api-route";
import { correctOpeningLine } from "@/server/modules/opening/opening-corrections.service";

/** Edit a posted opening line: posts the corrected line and reverses the old one. */
export const POST = apiRoute(
  { permission: "opening.post", body: openingLineCorrectionSchema, successStatus: 201 },
  ({ actor, params, body }) => correctOpeningLine(actor, uuidParam(params, "id", "Opening stock line"), body),
);
