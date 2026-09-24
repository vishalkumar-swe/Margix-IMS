import { apiRoute } from "@/server/http/api-route";
import { markAllNotificationsRead } from "@/server/modules/notifications/notification-inbox.service";

export const POST = apiRoute({}, ({ user }) => markAllNotificationsRead(user.id));
