import { reorderRuleSchema } from "@/lib/validation/alerts";
import { apiRoute } from "@/server/http/api-route";
import { listReorderRules } from "@/server/modules/alerts/alerts.queries";
import { saveReorderRule } from "@/server/modules/alerts/alerts.service";

export const GET = apiRoute({ permission: "alert.view" }, () => listReorderRules());

/** Creates or updates the rule for a SKU × godown (idempotent upsert). */
export const POST = apiRoute({ permission: "alert.manage", body: reorderRuleSchema }, ({ actor, body }) =>
  saveReorderRule(actor, body),
);
