import type { NotificationChannel, Prisma } from "@prisma/client";
import type { Tx } from "@/server/db/transaction";
import type { NotificationMessage } from "./notification-messages";
import type { NotificationRuleSettings } from "./notification-settings.service";

export interface Recipient {
  channel: NotificationChannel;
  recipient: string;
}

/**
 * Everyone a rule addresses, per enabled channel: in-app to active users with
 * one of the roles or picked by name (each user once), plus the configured
 * e-mail addresses and WhatsApp numbers.
 */
export async function resolveRecipients(tx: Tx, rule: NotificationRuleSettings): Promise<Recipient[]> {
  const recipients: Recipient[] = [];
  if (rule.inAppEnabled && (rule.inAppRoles.length > 0 || rule.inAppUserIds.length > 0)) {
    const users = await tx.user.findMany({
      where: {
        isActive: true,
        OR: [{ role: { code: { in: rule.inAppRoles } } }, { id: { in: rule.inAppUserIds } }],
      },
      select: { id: true },
      orderBy: { createdAt: "asc" },
    });
    recipients.push(...users.map((u) => ({ channel: "IN_APP" as const, recipient: u.id })));
  }
  if (rule.emailEnabled) {
    recipients.push(...rule.emailRecipients.map((email) => ({ channel: "EMAIL" as const, recipient: email })));
  }
  if (rule.whatsappEnabled) {
    recipients.push(...rule.whatsappRecipients.map((phone) => ({ channel: "WHATSAPP" as const, recipient: phone })));
  }
  return recipients;
}

/**
 * Queues a message for every recipient of the rule — inside the caller's
 * transaction, so a rolled-back change never notifies anyone (transactional
 * outbox). The notify worker delivers the rows.
 *
 * @returns the number of deliveries queued.
 */
export async function enqueueNotification(
  tx: Tx,
  rule: NotificationRuleSettings,
  message: NotificationMessage,
  options: { stockAlertId?: string } = {},
): Promise<number> {
  if (!rule.isEnabled) return 0;
  const recipients = await resolveRecipients(tx, rule);
  if (recipients.length === 0) return 0;

  const { count } = await tx.notificationOutbox.createMany({
    data: recipients.map(({ channel, recipient }) => ({
      channel,
      recipient,
      alertType: message.alertType,
      stockAlertId: options.stockAlertId ?? null,
      subject: message.subject,
      body: message.text,
      link: message.link,
      payload: { whatsapp: message.whatsapp } as unknown as Prisma.InputJsonValue,
    })),
  });
  return count;
}
