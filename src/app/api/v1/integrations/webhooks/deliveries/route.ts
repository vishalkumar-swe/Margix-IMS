import { apiRoute } from "@/server/http/api-route";
import { listWebhookDeliveries } from "@/server/integrations/webhooks/webhooks.service";

/** The 50 most recent webhook deliveries. */
export const GET = apiRoute({ permission: "settings.manage" }, () => listWebhookDeliveries());
