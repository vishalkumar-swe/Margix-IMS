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
    data: [
      {
        entityType: input.entityType,
        entityId: input.entityId,
        entityNo: input.entityNo,
        // A new document is due immediately. The schema default `now()` is the
        // transaction start and rounds to milliseconds, which can leave the job
        // a fraction of a millisecond in the future when a worker runs right
        // after commit.
        nextAttemptAt: new Date(0),
      },
    ],
    skipDuplicates: true,
  });
  return true;
}
