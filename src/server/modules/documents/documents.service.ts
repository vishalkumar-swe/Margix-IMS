import type { PostedDocStatus } from "@prisma/client";
import { isUniqueViolation } from "@/server/db/pg-error";
import type { Tx } from "@/server/db/transaction";

export type DocumentPrefix = "PO" | "GRN" | "DSP" | "ADJ" | "OPN";

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/**
 * Indian financial year code (April–March, evaluated in IST), e.g. 2026-09-24 → "2627".
 */
export function financialYearCode(date: Date): string {
  const ist = new Date(date.getTime() + IST_OFFSET_MS);
  const year = ist.getUTCFullYear();
  const startYear = ist.getUTCMonth() >= 3 ? year : year - 1;
  const endYear = startYear + 1;
  return `${String(startYear % 100).padStart(2, "0")}${String(endYear % 100).padStart(2, "0")}`;
}

/**
 * Allocates the next number for a document series, e.g. "GRN-2627-00042".
 * The sequence row stays locked until the surrounding transaction ends, so
 * numbers are unique, ordered and gap-free even under concurrency.
 */
export async function nextDocumentNumber(
  tx: Tx,
  prefix: DocumentPrefix,
  date: Date = new Date(),
): Promise<string> {
  const fy = financialYearCode(date);
  const rows = await tx.$queryRaw<{ last_value: number }[]>`
    INSERT INTO "document_sequence" ("key", "last_value")
    VALUES (${`${prefix}:${fy}`}, 1)
    ON CONFLICT ("key") DO UPDATE SET "last_value" = "document_sequence"."last_value" + 1
    RETURNING "last_value"`;
  return `${prefix}-${fy}-${String(rows[0].last_value).padStart(5, "0")}`;
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
