import { apiRoute, uuidParam } from "@/server/http/api-route";
import { retryDelivery } from "@/server/modules/notifications/notification-delivery.service";

export const POST = apiRoute({ permission: "settings.manage" }, ({ actor, params }) =>
  retryDelivery(actor, uuidParam(params, "id", "Notification")),
);
