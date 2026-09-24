import type { PostedDocStatus } from "@prisma/client";
import { isUniqueViolation } from "@/server/db/pg-error";
import type { Tx } from "@/server/db/transaction";
import { allocateCode } from "@/server/modules/numbering/numbering.service";

export type DocumentPrefix = "PO" | "GRN" | "DSP" | "ADJ" | "OPN" | "INV" | "TRF" | "SRN" | "PRN";

/**
 * Allocates the next number of a document series, e.g. "GRN-2026-000042", in
 * the format set in the numbering master. The counter row stays locked until
 * the surrounding transaction ends, so numbers are unique and ordered even
 * under concurrency.
 */
export function nextDocumentNumber(tx: Tx, prefix: DocumentPrefix, date: Date = new Date()): Promise<string> {
  return allocateCode(tx, prefix, date);
}

/**
 * Makes document creation idempotent: a client submits a UUID per form, and a
 * repeated submission (double click, network retry) returns the document that
 * was already created instead of posting stock twice. The unique index on
 * idempotency_key settles concurrent duplicates.
 */
export async function withIdempotency<T>(
  key: string | undefined,
  findExisting: (key: string) => Promise<T | null>,
  create: () => Promise<T>,
): Promise<T> {
  if (!key) return create();

  const existing = await findExisting(key);
  if (existing) return existing;

  try {
    return await create();
  } catch (error) {
    if (isUniqueViolation(error, "idempotency_key")) {
      const winner = await findExisting(key);
      if (winner) return winner;
    }
    throw error;
  }
}

/** Status of a posted document given how many of its ledger entries have been reversed. */
export function derivePostedDocStatus(totalEntries: number, reversedEntries: number): PostedDocStatus {
  if (reversedEntries <= 0) return "POSTED";
  return reversedEntries >= totalEntries ? "REVERSED" : "PARTIALLY_REVERSED";
}
