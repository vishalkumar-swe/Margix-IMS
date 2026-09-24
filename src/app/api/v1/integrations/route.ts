import { apiRoute } from "@/server/http/api-route";
import { describeIntegrations } from "@/server/integrations/registry";

/** Every integration with its status, settings checklist (set / not set) and queue figures. */
export const GET = apiRoute({ permission: "settings.manage" }, () => describeIntegrations());
