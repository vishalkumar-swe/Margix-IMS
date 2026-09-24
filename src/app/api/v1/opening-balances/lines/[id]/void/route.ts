import { openingLineVoidSchema } from "@/lib/validation/opening";
import { apiRoute, uuidParam } from "@/server/http/api-route";
import { voidOpeningLine } from "@/server/modules/opening/opening-corrections.service";

/** Delete a posted opening line: reverses it (it stays visible in history). */
export const POST = apiRoute({ permission: "opening.post", body: openingLineVoidSchema }, ({ actor, params, body }) =>
  voidOpeningLine(actor, uuidParam(params, "id", "Opening stock line"), body.reason),
);
