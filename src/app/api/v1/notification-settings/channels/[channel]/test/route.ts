import { notificationChannelSchema, notificationTestSchema } from "@/lib/validation/notifications";
import { NotFoundError } from "@/server/errors";
import { apiRoute } from "@/server/http/api-route";
import { sendTestNotification } from "@/server/modules/notifications/notification-test.service";

/** Sends a test message on one channel right away and reports the outcome (sent / skipped / failed). */
export const POST = apiRoute({ permission: "settings.manage", body: notificationTestSchema }, ({ actor, params, body }) => {
  const channel = notificationChannelSchema.safeParse(params.channel);
  if (!channel.success) throw new NotFoundError("Channel", params.channel);
  return sendTestNotification(actor, channel.data, body.recipient);
});
