import { ZERO, type Decimal } from "@/server/db/decimal";

export interface BatchStock {
  batchId: string;
  batchNumber: string;
  expiryDate: Date | null;
  quantity: Decimal;
}

export interface FefoAllocation {
  batchId: string;
  batchNumber: string;
  expiryDate: Date | null;
  quantity: Decimal;
}

/**
 * First-Expired-First-Out allocation: takes stock from the batch that expires
 * first, then the next, until `requested` is covered. Batches without an
 * expiry date go last; batches already expired on `today` are never offered.
 * Returns the allocations and any shortfall (requested − allocated).
 */
export function allocateFefo(
  batches: BatchStock[],
  requested: Decimal,
  today: Date,
): { allocations: FefoAllocation[]; shortfall: Decimal } {
  const usable = batches
    .filter((b) => b.quantity.greaterThan(0) && (!b.expiryDate || b.expiryDate.getTime() >= today.getTime()))
    .sort(
      (a, b) =>
        (a.expiryDate?.getTime() ?? Number.POSITIVE_INFINITY) - (b.expiryDate?.getTime() ?? Number.POSITIVE_INFINITY) ||
        a.batchNumber.localeCompare(b.batchNumber),
    );

  const allocations: FefoAllocation[] = [];
  let remaining = requested;
  for (const batch of usable) {
    if (!remaining.greaterThan(0)) break;
    const take = batch.quantity.lessThan(remaining) ? batch.quantity : remaining;
    allocations.push({ batchId: batch.batchId, batchNumber: batch.batchNumber, expiryDate: batch.expiryDate, quantity: take });
    remaining = remaining.minus(take);
  }
  return { allocations, shortfall: remaining.greaterThan(0) ? remaining : ZERO };
}
