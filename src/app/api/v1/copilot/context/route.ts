import { apiRoute } from "@/server/http/api-route";
import { getWorkspaceCounts } from "@/server/modules/copilot/copilot.queries";

/** Live counts used by guardrails, deep links and the completion report. */
export const GET = apiRoute({ permission: "dashboard.view" }, () => getWorkspaceCounts());
