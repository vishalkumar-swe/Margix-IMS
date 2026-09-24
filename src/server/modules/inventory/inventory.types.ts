import type { AdjustmentReason, MovementType, ReferenceType } from "@prisma/client";
import type { Decimal } from "@/server/db/decimal";

/** Stock identity (spec §5.5): SKU + Godown + Batch. */
export interface StockKey {
  skuId: string;
  godownId: string;
  batchId: string;
}

/** The source document a ledger entry belongs to (spec §8 rule 5). */
export interface LedgerReference {
  type: ReferenceType;
  id: string;
  no: string;
  lineId?: string | null;
}

export interface PostMovementInput {
  key: StockKey;
  movementType: Exclude<MovementType, "REVERSAL">;
  /** Signed quantity; must match the movement direction. */
  quantity: Decimal;
  reference: LedgerReference;
  reasonCode?: AdjustmentReason | null;
  remarks?: string | null;
}
