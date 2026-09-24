import type { NotificationChannel } from "@prisma/client";
import { NOTIFICATION_CHANNEL_LABELS } from "@/lib/enums";
import { whatsappNumberSchema } from "@/lib/validation/notifications";
import type { Actor } from "@/server/actor";
import { withTx } from "@/server/db/transaction";
import { ValidationError } from "@/server/errors";
import { recordAudit } from "@/server/modules/audit/audit.service";
import type { DeliveryResult } from "./channels/channel.types";
import { createChannelProviders, type ChannelProviders } from "./channels";
import { testMessage } from "./notification-messages";
import { getNotificationRule } from "./notification-settings.service";

export interface TestResult {
  channel: NotificationChannel;
  recipient: string;
  result: DeliveryResult;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * "Send test" on the settings screen: sends one message right away (not via
 * the outbox) so the administrator sees the outcome at once. In-app goes to
 * the caller; e-mail and WhatsApp to the given recipient, or the first one
 * configured for low-stock alerts. Audited with its outcome.
 */
export async function sendTestNotification(
  actor: Actor,
  channel: NotificationChannel,
  requestedRecipient: string | undefined,
  providers: ChannelProviders = createChannelProviders(),
): Promise<TestResult> {
  const recipient = await resolveTestRecipient(actor, channel, requestedRecipient);
  const message = testMessage(NOTIFICATION_CHANNEL_LABELS[channel]);
  const result = await providers[channel].send({
    recipient,
    alertType: null,
    subject: message.subject,
    text: message.text,
    link: message.link,
    whatsapp: message.whatsapp,
  });
  await withTx((tx) =>
    recordAudit(tx, actor, {
      action: "NOTIFICATION_TEST_SENT",
      entityType: "NotificationChannel",
      entityId: channel,
      newData: { recipient, ...result },
    }),
  );
  return { channel, recipient, result };
}

async function resolveTestRecipient(actor: Actor, channel: NotificationChannel, requested: string | undefined): Promise<string> {
  if (channel === "IN_APP") return actor.userId;
  const rule = await getNotificationRule("LOW_STOCK");
  const candidate = requested ?? (channel === "EMAIL" ? rule.emailRecipients[0] : rule.whatsappRecipients[0]);
  if (!candidate) {
    throw new ValidationError("The request is invalid.", [
      { path: "recipient", message: channel === "EMAIL" ? "Enter an e-mail address." : "Enter a WhatsApp number." },
    ]);
  }
  if (channel === "EMAIL") {
    const email = candidate.trim().toLowerCase();
    if (!EMAIL.test(email)) throw new ValidationError("The request is invalid.", [{ path: "recipient", message: "Enter a valid e-mail address." }]);
    return email;
  }
  const phone = whatsappNumberSchema.safeParse(candidate);
  if (!phone.success) {
    throw new ValidationError("The request is invalid.", [{ path: "recipient", message: phone.error.issues[0].message }]);
  }
  return phone.data;
}
