import type { Prisma } from "@prisma/client";
import { prisma } from "./client";
import { getPgError } from "./pg-error";

export type Tx = Prisma.TransactionClient;

const MAX_ATTEMPTS = 3;
/** Serialization failure and deadlock — safe to retry the whole transaction. */
const RETRYABLE_SQLSTATES = new Set(["40001", "40P01"]);

/**
 * Runs `fn` in a single interactive transaction (READ COMMITTED). Concurrency
 * is handled with conditional updates and row locks inside the services; the
 * rare deadlock or serialization failure is retried transparently.
 */
export async function withTx<T>(fn: (tx: Tx) => Promise<T>, options: { timeoutMs?: number } = {}): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await prisma.$transaction(fn, { maxWait: 5_000, timeout: options.timeoutMs ?? 15_000 });
    } catch (error) {
      const pg = getPgError(error);
      if (attempt < MAX_ATTEMPTS && pg && RETRYABLE_SQLSTATES.has(pg.code)) {
        continue;
      }
      throw error;
    }
  }
}
