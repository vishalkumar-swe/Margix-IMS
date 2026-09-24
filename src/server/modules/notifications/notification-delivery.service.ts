import type { NotificationAlertType, NotificationChannel, NotificationOutbox, NotificationStatus } from "@prisma/client";
import type { Actor } from "@/server/actor";
import { prisma } from "@/server/db/client";
import { withTx } from "@/server/db/transaction";
import { ConflictError, NotFoundError } from "@/server/errors";
import { recordAudit } from "@/server/modules/audit/audit.service";
import { logger } from "@/server/observability/logger";
import { describeError, type DeliveryResult, type OutgoingNotification } from "./channels/channel.types";
import { createChannelProviders, type ChannelProviders } from "./channels";
import type { WhatsappContent } from "./notification-messages";
import { MAX_DELIVERY_ATTEMPTS, retryDelayMinutes } from "./notification-schedule";

const CLAIM_LEASE = "2 minutes";

export interface DeliverySummary {
  processed: number;
  sent: number;
  skipped: number;
  failed: number;
}

interface ClaimedDelivery {
  id: string;
  channel: NotificationChannel;
  recipient: string;
  alert_type: NotificationAlertType | null;
  subject: string;
  body: string;
  link: string | null;
  payload: { whatsapp?: WhatsappContent } | null;
  attempts: number;
}

/**
 * Delivers due outbox rows (the Tally queue pattern): rows are claimed with
 * FOR UPDATE SKIP LOCKED under a short lease, so concurrent workers never send
 * the same message twice and a crashed worker's claim expires. Failures back
 * off exponentially; permanent failures and exhausted rows wait for a manual
 * retry. Channel calls happen outside any database transaction.
 */
export async function deliverDueNotifications(
  options: { providers?: ChannelProviders; limit?: number } = {},
): Promise<DeliverySummary> {
  const providers = options.providers ?? createChannelProviders();
  const claimed = await claimDue(options.limit ?? 50);
  const summary: DeliverySummary = { processed: claimed.length, sent: 0, skipped: 0, failed: 0 };

  for (const row of claimed) {
    const startedAt = Date.now();
    let result: DeliveryResult;
    try {
      result = await providers[row.channel].send(toOutgoing(row));
    } catch (error) {
      // Providers should not throw; treat it as a transient failure if one does.
      result = { status: "FAILED", error: describeError(error), retryable: true };
    }
    await recordAttempt(row, result, Date.now() - startedAt);
    if (result.status === "SENT") summary.sent++;
    else if (result.status === "SKIPPED") summary.skipped++;
    else {
      summary.failed++;
      logger.warn("notification delivery failed", { id: row.id, channel: row.channel, attempt: row.attempts, error: result.error });
    }
  }
  if (summary.processed > 0) logger.info("notification delivery run", { ...summary });
  return summary;
}

/** Re-queues a FAILED delivery immediately with a fresh attempt budget. */
export function retryDelivery(actor: Actor, id: string): Promise<NotificationOutbox> {
  return withTx(async (tx) => {
    const { count } = await tx.notificationOutbox.updateMany({
      where: { id, status: "FAILED" },
      data: { status: "PENDING", attempts: 0, nextAttemptAt: new Date(), lockedUntil: null },
    });
    if (count === 0) {
      const row = await tx.notificationOutbox.findUnique({ where: { id }, select: { status: true } });
      if (!row) throw new NotFoundError("Notification", id);
      throw new ConflictError("INVALID_STATE", `Only failed notifications can be retried (this one is ${row.status}).`);
    }
    await recordAudit(tx, actor, { action: "NOTIFICATION_RETRIED", entityType: "NotificationOutbox", entityId: id });
    return tx.notificationOutbox.findUniqueOrThrow({ where: { id } });
  });
}

async function claimDue(limit: number): Promise<ClaimedDelivery[]> {
  return prisma.$queryRaw<ClaimedDelivery[]>`
    UPDATE "notification_outbox"
    SET "status" = 'IN_PROGRESS',
        "locked_until" = now() + ${CLAIM_LEASE}::interval,
        "attempts" = "attempts" + 1,
        "updated_at" = now()
    WHERE "id" IN (
      SELECT "id" FROM "notification_outbox"
      WHERE ("status" IN ('PENDING', 'FAILED') AND "next_attempt_at" <= now() AND "attempts" < ${MAX_DELIVERY_ATTEMPTS})
         OR ("status" = 'IN_PROGRESS' AND "locked_until" < now())
      ORDER BY "created_at"
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING "id", "channel", "recipient", "alert_type", "subject", "body", "link", "payload", "attempts"`;
}

function toOutgoing(row: ClaimedDelivery): OutgoingNotification {
  return {
    recipient: row.recipient,
    alertType: row.alert_type,
    subject: row.subject,
    text: row.body,
    link: row.link,
    whatsapp: row.payload?.whatsapp ?? null,
  };
}

async function recordAttempt(row: ClaimedDelivery, result: DeliveryResult, durationMs: number): Promise<void> {
  const status: NotificationStatus = result.status;
  const error = result.status === "FAILED" ? result.error : result.status === "SKIPPED" ? result.reason : null;
  const data =
    result.status === "SENT"
      ? { status, sentAt: new Date(), providerMessageId: result.providerMessageId ?? null, lastError: null, lockedUntil: null }
      : result.status === "SKIPPED"
        ? { status, lastError: error, lockedUntil: null }
        : {
            status,
            lastError: error,
            lockedUntil: null,
            // A permanent failure uses up the attempt budget: only a manual retry sends it again.
            ...(result.retryable
              ? { nextAttemptAt: new Date(Date.now() + retryDelayMinutes(row.attempts) * 60_000) }
              : { attempts: MAX_DELIVERY_ATTEMPTS }),
          };

  await prisma.$transaction([
    prisma.notificationOutbox.update({ where: { id: row.id }, data }),
    prisma.notificationAttempt.create({
      data: { outboxId: row.id, attemptNo: row.attempts, status, error, durationMs },
    }),
  ]);
}
