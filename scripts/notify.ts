/**
 * Runs one notification worker pass: the daily jobs that are due (slow-moving
 * scan, digests) and delivery of queued in-app, e-mail and WhatsApp messages.
 * Intended for a scheduler (loop, cron, systemd timer), every 1–5 minutes:
 *   npm run notify:run
 */
import { prisma } from "@/server/db/client";
import { runNotificationWorker } from "@/server/modules/notifications/notification-worker.service";

async function main() {
  const { slowMovingScan, digests, delivery } = await runNotificationWorker({ limit: 200 });
  if (slowMovingScan) {
    console.log(
      `Slow-moving scan (${slowMovingScan.slowStockDays}+ days): ${slowMovingScan.active} active, ` +
        `${slowMovingScan.raised} new, ${slowMovingScan.resolved} resolved.`,
    );
  }
  for (const digest of digests) {
    console.log(`Digest ${digest.alertType}: ${digest.alerts} alerts, ${digest.queued} messages queued.`);
  }
  console.log(
    `Notifications: processed ${delivery.processed}, sent ${delivery.sent}, ` +
      `skipped ${delivery.skipped} (channel not configured), failed ${delivery.failed}.`,
  );
  if (delivery.failed > 0) process.exitCode = 2;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
