import { apiRoute, uuidParam } from "@/server/http/api-route";
import { retryWebhookDelivery } from "@/server/integrations/webhooks/webhooks.service";

export const POST = apiRoute({ permission: "settings.manage" }, ({ actor, params }) =>
  retryWebhookDelivery(actor, uuidParam(params, "id", "Webhook delivery")),
);
