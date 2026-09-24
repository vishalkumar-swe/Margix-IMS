import type { TallyEntityType } from "@prisma/client";
import type { Tx } from "@/server/db/transaction";

export interface TallyEnqueueInput {
  entityType: TallyEntityType;
  entityId: string;
  entityNo: string;
  godownId: string;
}

/**
 * Queues a posted document for Tally synchronisation (spec §7.1) inside the
 * business transaction. Godowns with Tally sync disabled are skipped.
 * Idempotent: a document is queued at most once.
 *
 * @returns whether a job was queued.
 */
export async function enqueueTallySync(tx: Tx, input: TallyEnqueueInput): Promise<boolean> {
  const godown = await tx.godown.findUniqueOrThrow({
    where: { id: input.godownId },
    select: { tallySyncEnabled: true },
  });
  if (!godown.tallySyncEnabled) return false;

  await tx.tallySyncJob.createMany({
    data: [{ entityType: input.entityType, entityId: input.entityId, entityNo: input.entityNo }],
    skipDuplicates: true,
  });
  return true;
}
