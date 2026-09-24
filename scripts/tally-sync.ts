/**
 * Runs one Tally sync pass. Intended for a scheduler (cron / systemd timer):
 *   npm run tally:sync
 */
import { prisma } from "@/server/db/client";
import { runTallySync } from "@/server/modules/tally/tally-sync.service";

async function main() {
  const summary = await runTallySync({ limit: 100 });
  if (!summary.enabled) {
    console.log("Tally integration is disabled (TALLY_MODE=disabled).");
    return;
  }
  console.log(`Tally sync: processed ${summary.processed}, synced ${summary.synced}, failed ${summary.failed}.`);
  if (summary.failed > 0) process.exitCode = 2;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
