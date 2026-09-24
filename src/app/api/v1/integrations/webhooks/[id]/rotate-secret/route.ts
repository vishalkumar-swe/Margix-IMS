import { apiRoute, uuidParam } from "@/server/http/api-route";
import { rotateWebhookSecret } from "@/server/integrations/webhooks/webhooks.service";

/** Issues a new signing secret (returned once); the old one stops working immediately. */
export const POST = apiRoute({ permission: "settings.manage" }, ({ actor, params }) =>
  rotateWebhookSecret(actor, uuidParam(params, "id", "Webhook")),
);
