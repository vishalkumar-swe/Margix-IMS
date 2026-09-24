import { webhookEndpointUpdateSchema } from "@/lib/validation/webhooks";
import { apiRoute, uuidParam } from "@/server/http/api-route";
import { deleteWebhookEndpoint, updateWebhookEndpoint } from "@/server/integrations/webhooks/webhooks.service";

export const PATCH = apiRoute({ permission: "settings.manage", body: webhookEndpointUpdateSchema }, ({ actor, params, body }) =>
  updateWebhookEndpoint(actor, uuidParam(params, "id", "Webhook"), body),
);

export const DELETE = apiRoute({ permission: "settings.manage" }, ({ actor, params }) =>
  deleteWebhookEndpoint(actor, uuidParam(params, "id", "Webhook")),
);
