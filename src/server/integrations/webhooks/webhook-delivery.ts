import { prisma } from "@/server/db/client";
import { getEnv } from "@/server/config/env";
import { describeIntegrationError, IntegrationHttpError, integrationFetch } from "../http";
import { DEFAULT_RETRY_POLICY, nextAttemptAt } from "../retry";
import { SIGNATURE_HEADER, signWebhookBody } from "./webhook-signature";

/**
 * Webhook delivery worker (run by the notify worker, scripts/notify.ts):
 * claims due deliveries with SKIP LOCKED (safe with several workers), POSTs
 * the signed JSON body, and records the outcome. 2xx = delivered; network
 * errors, timeouts, 408/429/5xx are retried with backoff; other 4xx are
 * permanent (the receiver rejected the request).
 */

const CLAIM_LEASE = "5 minutes";
const MAX_ATTEMPTS = DEFAULT_RETRY_POLICY.maxAttempts;

interface ClaimedDelivery {
  id: string;
  event: string;
  payload: unknown;
  attempts: number;
  url: string;
  secret: string;
}

export interface WebhookRunSummary {
  processed: number;
  delivered: number;
  failed: number;
}

export async function deliverDueWebhooks(options: { limit?: number; fetchImpl?: typeof fetch } = {}): Promise<WebhookRunSummary> {
  const claimed = await prisma.$queryRaw<ClaimedDelivery[]>`
    UPDATE "webhook_delivery" d
    SET "status" = 'IN_PROGRESS',
        "locked_until" = now() + ${CLAIM_LEASE}::interval,
        "attempts" = d."attempts" + 1
    FROM "webhook_endpoint" e
    WHERE e."id" = d."endpoint_id"
      AND d."id" IN (
        SELECT "id" FROM "webhook_delivery"
        WHERE ("status" IN ('PENDING', 'FAILED') AND "next_attempt_at" <= now() AND "attempts" < ${MAX_ATTEMPTS})
           OR ("status" = 'IN_PROGRESS' AND "locked_until" < now())
        ORDER BY "created_at"
        LIMIT ${options.limit ?? 100}
        FOR UPDATE SKIP LOCKED
      )
    RETURNING d."id", d."event", d."payload", d."attempts", e."url", e."secret"`;

  const summary: WebhookRunSummary = { processed: claimed.length, delivered: 0, failed: 0 };
  for (const row of claimed) {
    const ok = await attempt(row, options.fetchImpl);
    if (ok) summary.delivered++;
    else summary.failed++;
  }
  return summary;
}

/** One POST of a claimed delivery; records the result. Returns true when delivered. */
async function attempt(row: ClaimedDelivery, fetchImpl?: typeof fetch): Promise<boolean> {
  const body = JSON.stringify(row.payload);
  try {
    const response = await integrationFetch(
      row.url,
      {
        method: "POST",
        // A redirect is reported as a failure, never followed: it could lead to a private address.
        redirect: "manual",
        headers: {
          "content-type": "application/json",
          "user-agent": "Margix-Webhooks/1",
          "x-margix-event": row.event,
          "x-margix-delivery": row.id,
          [SIGNATURE_HEADER]: signWebhookBody(row.secret, body),
        },
        body,
      },
      { service: "The webhook receiver", timeoutMs: getEnv().WEBHOOK_TIMEOUT_MS, fetchImpl },
    );
    await prisma.webhookDelivery.update({
      where: { id: row.id },
      data: { status: "DELIVERED", deliveredAt: new Date(), responseStatus: response.status, lastError: null, lockedUntil: null },
    });
    return true;
  } catch (error) {
    const retryable = error instanceof IntegrationHttpError ? error.retryable : true;
    const exhausted = !retryable || row.attempts >= MAX_ATTEMPTS;
    await prisma.webhookDelivery.update({
      where: { id: row.id },
      data: {
        status: "FAILED",
        lastError: describeIntegrationError(error),
        responseStatus: error instanceof IntegrationHttpError ? (error.status ?? null) : null,
        lockedUntil: null,
        // A permanent failure stops retrying; an admin can retry it from the Integrations screen.
        ...(exhausted ? { attempts: MAX_ATTEMPTS } : { nextAttemptAt: nextAttemptAt(row.attempts) }),
      },
    });
    return false;
  }
}
