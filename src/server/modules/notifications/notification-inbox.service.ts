import { prisma } from "@/server/db/client";
import { NotFoundError } from "@/server/errors";

/**
 * Read state of the user's own in-app notifications. This is personal UI
 * state, not a business change, so it is not audited (like sign-in activity)
 * and does not trigger live updates for other users.
 */
export async function markNotificationRead(userId: string, id: string): Promise<void> {
  const { count } = await prisma.notification.updateMany({
    where: { id, userId },
    data: { readAt: new Date() },
  });
  // Someone else's notification looks exactly like a missing one.
  if (count === 0) throw new NotFoundError("Notification", id);
}

export async function markAllNotificationsRead(userId: string): Promise<{ updated: number }> {
  const { count } = await prisma.notification.updateMany({
    where: { userId, readAt: null },
    data: { readAt: new Date() },
  });
  return { updated: count };
}
