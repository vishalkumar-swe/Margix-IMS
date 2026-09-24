import { notificationListQuerySchema } from "@/lib/validation/notifications";
import { apiRoute } from "@/server/http/api-route";
import { listMyNotifications } from "@/server/modules/notifications/notifications.queries";

/** The signed-in user's own in-app notifications (latest first) and unread count. */
export const GET = apiRoute({ query: notificationListQuerySchema }, ({ user, query }) =>
  listMyNotifications(user.id, query.limit),
);
