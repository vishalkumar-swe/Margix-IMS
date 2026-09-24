import { apiRoute, uuidParam } from "@/server/http/api-route";
import { sendWebhookTest } from "@/server/integrations/webhooks/webhooks.service";

/** Queues a webhook.test event for this endpoint; the worker delivers it within seconds. */
export const POST = apiRoute({ permission: "settings.manage" }, ({ actor, params }) =>
  sendWebhookTest(actor, uuidParam(params, "id", "Webhook")),
);
