import { apiRoute, uuidParam } from "@/server/http/api-route";
import { markNotificationRead } from "@/server/modules/notifications/notification-inbox.service";

export const POST = apiRoute({}, ({ user, params }) =>
  markNotificationRead(user.id, uuidParam(params, "id", "Notification")),
);
