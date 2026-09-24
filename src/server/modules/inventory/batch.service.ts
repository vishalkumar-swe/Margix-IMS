import { randomUUID } from "node:crypto";
import type { Batch, Sku } from "@prisma/client";
import type { Tx } from "@/server/db/transaction";
import { ConflictError, NotFoundError, ValidationError } from "@/server/errors";

/** System batch that holds all stock of SKUs that are not batch-tracked. */
export const DEFAULT_BATCH_NUMBER = "DEFAULT";

export interface BatchInput {
  batchNumber?: string | null;
  manufacturingDate?: Date | null;
  expiryDate?: Date | null;
}

/**
 * Finds or creates the batch a stock movement belongs to. Uses a single
 * INSERT … ON CONFLICT so concurrent receipts of the same batch cannot race.
 * Dates missing on an existing batch are filled in; dates already recorded are
 * immutable — a receipt quoting a different date is rejected rather than
 * silently overwriting it.
 */
export async function resolveBatch(
  tx: Tx,
  sku: Pick<Sku, "id" | "code" | "isBatchTracked">,
  input: BatchInput,
): Promise<Batch> {
  const batchNumber = normaliseBatchNumber(sku, input.batchNumber);
  const manufacturingDate = sku.isBatchTracked ? (input.manufacturingDate ?? null) : null;
  const expiryDate = sku.isBatchTracked ? (input.expiryDate ?? null) : null;

  await tx.$executeRaw`
    INSERT INTO "batch" ("id", "sku_id", "batch_number", "manufacturing_date", "expiry_date", "created_at")
    VALUES (${randomUUID()}::uuid, ${sku.id}::uuid, ${batchNumber}, ${manufacturingDate}::date, ${expiryDate}::date, now())
    ON CONFLICT ("sku_id", "batch_number") DO UPDATE SET
      "manufacturing_date" = COALESCE("batch"."manufacturing_date", EXCLUDED."manufacturing_date"),
      "expiry_date" = COALESCE("batch"."expiry_date", EXCLUDED."expiry_date")`;

  const batch = await tx.batch.findUniqueOrThrow({
    where: { skuId_batchNumber: { skuId: sku.id, batchNumber } },
  });

  const mismatch =
    differs(batch.manufacturingDate, manufacturingDate) || differs(batch.expiryDate, expiryDate);
  if (mismatch) {
    throw new ConflictError(
      "BATCH_MISMATCH",
      `Batch ${batchNumber} of ${sku.code} already exists with different dates.`,
      {
        batch: batchNumber,
        existing: { manufacturingDate: batch.manufacturingDate, expiryDate: batch.expiryDate },
      },
    );
  }
  return batch;
}

/** Loads a batch and checks that it belongs to the given SKU. */
export async function getBatchForSku(tx: Tx, skuId: string, batchId: string): Promise<Batch> {
  const batch = await tx.batch.findUnique({ where: { id: batchId } });
  if (!batch || batch.skuId !== skuId) throw new NotFoundError("Batch", batchId);
  return batch;
}

function normaliseBatchNumber(sku: Pick<Sku, "code" | "isBatchTracked">, value?: string | null): string {
  if (!sku.isBatchTracked) return DEFAULT_BATCH_NUMBER;

  const batchNumber = value?.trim().toUpperCase();
  if (!batchNumber) {
    throw new ValidationError(`A batch number is required for ${sku.code}.`);
  }
  if (batchNumber === DEFAULT_BATCH_NUMBER) {
    throw new ValidationError(`"${DEFAULT_BATCH_NUMBER}" is a reserved batch number.`);
  }
  return batchNumber;
}

/** A provided date conflicts only if the batch already had a different one. */
function differs(existing: Date | null, provided: Date | null): boolean {
  if (!provided || !existing) return false;
  return existing.getTime() !== provided.getTime();
}
