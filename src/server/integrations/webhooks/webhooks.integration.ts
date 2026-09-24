import { prisma } from "@/server/db/client";
import { getEnv, type Env } from "@/server/config/env";
import type { Integration } from "../integration.types";

/**
 * Outgoing webhooks: business events (see src/lib/webhook-events.ts) are
 * queued in webhook_delivery inside the business transaction and POSTed,
 * signed, by the notify worker. Endpoints are managed on the Integrations
 * screen; implementation in this folder.
 */
export function webhooksIntegration(env: Env = getEnv()): Integration {
  return {
    key: "webhooks",
    name: "Webhooks",
    category: "events",
    description: "Sends signed JSON events (orders, receipts, dispatches, low stock, …) to any system that accepts HTTP callbacks.",
    docsAnchor: "webhooks",
    settings: [
      { env: "WEBHOOK_TIMEOUT_MS", description: "Delivery timeout per request", required: false, secret: false },
      {
        env: "WEBHOOK_ALLOW_PRIVATE_URLS",
        description: "true allows http:// and LAN addresses (on-premise receivers)",
        required: false,
        secret: false,
      },
    ],
    status() {
      return {
        state: "active",
        summary: env.WEBHOOK_ALLOW_PRIVATE_URLS
          ? "Endpoints may use private addresses and plain http."
          : "Endpoints must be public https URLs. Add them below.",
      };
    },
    async queueStats() {
      const [pending, failed, lastDelivered, lastFailure] = await Promise.all([
        prisma.webhookDelivery.count({ where: { status: { in: ["PENDING", "IN_PROGRESS"] } } }),
        prisma.webhookDelivery.count({ where: { status: "FAILED" } }),
        prisma.webhookDelivery.findFirst({ where: { status: "DELIVERED" }, orderBy: { deliveredAt: "desc" }, select: { deliveredAt: true } }),
        prisma.webhookDelivery.findFirst({ where: { status: "FAILED" }, orderBy: { createdAt: "desc" }, select: { lastError: true } }),
      ]);
      return { pending, failed, lastSuccessAt: lastDelivered?.deliveredAt ?? null, lastError: lastFailure?.lastError ?? null };
    },
  };
}
