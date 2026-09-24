import { withTx } from "@/server/db/transaction";
import { apiRoute } from "@/server/http/api-route";
import { recordAudit } from "@/server/modules/audit/audit.service";
import { runTallySync } from "@/server/modules/tally/tally-sync.service";

export const POST = apiRoute({ permission: "tally.sync" }, async ({ actor }) => {
  const summary = await runTallySync();
  await withTx((tx) =>
    recordAudit(tx, actor, { action: "TALLY_SYNC_RUN", entityType: "TallySyncJob", newData: summary }),
  );
  return summary;
});
