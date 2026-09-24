import { codeSeriesUpdateSchema } from "@/lib/validation/settings";
import { apiRoute } from "@/server/http/api-route";
import { updateCodeSeries } from "@/server/modules/numbering/numbering.service";

export const PATCH = apiRoute({ permission: "settings.manage", body: codeSeriesUpdateSchema }, ({ actor, params, body }) =>
  updateCodeSeries(actor, String(params.key), body),
);
