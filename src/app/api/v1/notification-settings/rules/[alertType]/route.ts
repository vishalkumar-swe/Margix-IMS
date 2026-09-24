import { notificationAlertTypeSchema, notificationRuleSchema } from "@/lib/validation/notifications";
import { NotFoundError } from "@/server/errors";
import { apiRoute } from "@/server/http/api-route";
import { saveNotificationRule } from "@/server/modules/notifications/notification-settings.service";

/** Recipients, channels, frequency and on/off for one alert type (LOW_STOCK, SLOW_MOVING). */
export const PATCH = apiRoute({ permission: "settings.manage", body: notificationRuleSchema }, ({ actor, params, body }) => {
  const alertType = notificationAlertTypeSchema.safeParse(params.alertType);
  if (!alertType.success) throw new NotFoundError("Alert type", params.alertType);
  return saveNotificationRule(actor, alertType.data, body);
});
