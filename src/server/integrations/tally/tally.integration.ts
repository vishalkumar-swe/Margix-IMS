import { prisma } from "@/server/db/client";
import { getEnv, type Env } from "@/server/config/env";
import { createTallyClient } from "@/server/modules/tally/tally-client";
import type { Integration, IntegrationQueueStats } from "../integration.types";

/**
 * Tally Prime: every posted stock document is queued (tally_sync_job) in the
 * same transaction and pushed by the tally-sync worker as a Stock Journal.
 * Implementation: src/server/modules/tally/.
 */
export function tallyIntegration(env: Env = getEnv()): Integration {
  return {
    key: "tally",
    name: "Tally Prime",
    category: "accounting",
    description: "Posts every stock movement to Tally Prime as a Stock Journal voucher, with retries.",
    docsAnchor: "tally-prime",
    settings: [
      { env: "TALLY_MODE", description: "mock | fail | xml | disabled", required: true, secret: false },
      { env: "TALLY_URL", description: "Tally Prime HTTP/XML server, e.g. http://tally-pc:9000", required: false, secret: false },
      { env: "TALLY_COMPANY", description: "Company name exactly as loaded in Tally (required for xml)", required: false, secret: false },
      { env: "TALLY_TIMEOUT_MS", description: "Request timeout", required: false, secret: false },
    ],
    status() {
      switch (env.TALLY_MODE) {
        case "xml":
          return env.TALLY_COMPANY
            ? { state: "active", summary: `Posting to ${env.TALLY_URL}, company "${env.TALLY_COMPANY}".` }
            : { state: "misconfigured", summary: "TALLY_MODE=xml needs TALLY_COMPANY." };
        case "mock":
          return { state: "simulated", summary: "Mock mode: vouchers are marked synced without contacting Tally." };
        case "fail":
          return { state: "simulated", summary: "Simulated outage: every push fails and is retried (for testing)." };
        default:
          return { state: "disabled", summary: "Switched off (TALLY_MODE=disabled); nothing is queued." };
      }
    },
    async check() {
      const client = createTallyClient(env);
      if (!client) return { ok: false, message: "Tally integration is disabled." };
      const started = Date.now();
      const result = await client.ping();
      return { ...result, latencyMs: Date.now() - started };
    },
    async queueStats(): Promise<IntegrationQueueStats> {
      const [pending, failed, lastSuccess, lastFailure] = await Promise.all([
        prisma.tallySyncJob.count({ where: { status: { in: ["PENDING", "IN_PROGRESS"] } } }),
        prisma.tallySyncJob.count({ where: { status: "FAILED" } }),
        prisma.tallySyncJob.findFirst({ where: { status: "SYNCED" }, orderBy: { syncedAt: "desc" }, select: { syncedAt: true } }),
        prisma.tallySyncJob.findFirst({ where: { lastError: { not: null } }, orderBy: { updatedAt: "desc" }, select: { lastError: true } }),
      ]);
      return { pending, failed, lastSuccessAt: lastSuccess?.syncedAt ?? null, lastError: lastFailure?.lastError ?? null };
    },
  };
}
