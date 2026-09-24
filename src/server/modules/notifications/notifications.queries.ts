import type { NotificationStatus } from "@prisma/client";
import { NOTIFICATION_STATUSES } from "@/lib/enums";
import { prisma } from "@/server/db/client";

/** The signed-in user's notification centre: latest first, plus the unread count. */
export async function listMyNotifications(userId: string, limit = 20) {
  const [items, unread] = await prisma.$transaction([
    prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: { id: true, alertType: true, title: true, body: true, link: true, readAt: true, createdAt: true },
    }),
    prisma.notification.count({ where: { userId, readAt: null } }),
  ]);
  return { items, unread };
}

export function countUnreadNotifications(userId: string): Promise<number> {
  return prisma.notification.count({ where: { userId, readAt: null } });
}

/** Latest outbox deliveries with their outcome, for the settings screen. */
export function listRecentDeliveries(options: { status?: NotificationStatus; limit?: number } = {}) {
  return prisma.notificationOutbox.findMany({
    where: { status: options.status },
    orderBy: { createdAt: "desc" },
    take: options.limit ?? 50,
    select: {
      id: true,
      channel: true,
      recipient: true,
      alertType: true,
      subject: true,
      status: true,
      attempts: true,
      lastError: true,
      nextAttemptAt: true,
      sentAt: true,
      createdAt: true,
    },
  });
}

export async function countDeliveriesByStatus(): Promise<Record<NotificationStatus, number>> {
  const rows = await prisma.notificationOutbox.groupBy({ by: ["status"], _count: { _all: true } });
  const counts = Object.fromEntries(NOTIFICATION_STATUSES.map((s) => [s, 0])) as Record<NotificationStatus, number>;
  for (const row of rows) counts[row.status] = row._count._all;
  return counts;
}

/** Active users that can be picked as in-app recipients. */
export function listRecipientUsers() {
  return prisma.user.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true, email: true, role: { select: { code: true } } },
  });
}
