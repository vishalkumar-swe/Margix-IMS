import { webhookEndpointSchema } from "@/lib/validation/webhooks";
import { apiRoute } from "@/server/http/api-route";
import { createWebhookEndpoint, listWebhookEndpoints } from "@/server/integrations/webhooks/webhooks.service";

export const GET = apiRoute({ permission: "settings.manage" }, () => listWebhookEndpoints());

/** Creates an endpoint; the response carries the signing secret — the only time it is shown. */
export const POST = apiRoute({ permission: "settings.manage", body: webhookEndpointSchema }, ({ actor, body }) =>
  createWebhookEndpoint(actor, body),
);
