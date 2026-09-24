import { prisma } from "@/server/db/client";
import type { DeliveryResult, NotificationChannelProvider, OutgoingNotification } from "./channel.types";

/**
 * In-app notification centre: delivery is a row in `notification` for the
 * recipient user. The insert is announced on the live change feed, so the
 * bell's unread count refreshes on every open screen.
 */
export class InAppChannel implements NotificationChannelProvider {
  readonly channel = "IN_APP" as const;

  status() {
    return { channel: this.channel, configured: true, detail: "Built in: the bell in the app header." };
  }

  async send(notification: OutgoingNotification): Promise<DeliveryResult> {
    const user = await prisma.user.findUnique({ where: { id: notification.recipient }, select: { isActive: true } });
    if (!user?.isActive) return { status: "SKIPPED", reason: "skipped: user inactive or removed" };
    const row = await prisma.notification.create({
      data: {
        userId: notification.recipient,
        alertType: notification.alertType,
        title: notification.subject,
        body: notification.text,
        link: notification.link,
      },
      select: { id: true },
    });
    return { status: "SENT", providerMessageId: row.id };
  }
}
