import type { ReferenceType, TallyEntityType } from "@prisma/client";
import { utcToDateOnly } from "@/lib/dates";
import { prisma } from "@/server/db/client";
import type { TallyVoucher, TallyVoucherType } from "./tally-client";

/** A problem the business can fix (e.g. missing mapping); its message is shown to users as-is. */
export class TallyMappingError extends Error {}

const VOUCHER_TYPES: Record<TallyEntityType, TallyVoucherType> = {
  OPENING_BALANCE: "Stock Journal",
  GRN: "Receipt Note",
  DISPATCH: "Delivery Note",
  ADJUSTMENT: "Physical Stock",
  REVERSAL: "Stock Journal",
};

const REFERENCE_TYPES: Record<Exclude<TallyEntityType, "REVERSAL">, ReferenceType> = {
  OPENING_BALANCE: "OPENING_BALANCE",
  GRN: "GRN",
  DISPATCH: "DISPATCH",
  ADJUSTMENT: "ADJUSTMENT",
};

interface JobRef {
  entityType: TallyEntityType;
  entityId: string;
  entityNo: string;
}

/**
 * Builds the Tally voucher for a queued document from its ledger entries.
 * Throws TallyMappingError when a SKU or godown has no Tally mapping, e.g.
 * "Item RM-001 is not mapped in Tally." (spec §7.2).
 */
export async function buildTallyVoucher(job: JobRef): Promise<TallyVoucher> {
  const entries = await prisma.inventoryLedger.findMany({
    where:
      job.entityType === "REVERSAL"
        ? { id: job.entityId }
        : {
            referenceType: REFERENCE_TYPES[job.entityType],
            referenceId: job.entityId,
            movementType: { not: "REVERSAL" },
          },
    orderBy: { entryNo: "asc" },
    include: {
      sku: { select: { code: true, tallyStockItemName: true, baseUom: { select: { code: true } } } },
      godown: { select: { code: true, tallyGodownName: true } },
      batch: { select: { batchNumber: true } },
      reversesEntry: { select: { entryNo: true } },
    },
  });
  if (entries.length === 0) throw new TallyMappingError(`No stock entries found for ${job.entityNo}.`);

  const lines = entries.map((entry) => {
    if (!entry.sku.tallyStockItemName) {
      throw new TallyMappingError(`Item ${entry.sku.code} is not mapped in Tally.`);
    }
    if (!entry.godown.tallyGodownName) {
      throw new TallyMappingError(`Godown ${entry.godown.code} is not mapped in Tally.`);
    }
    return {
      stockItem: entry.sku.tallyStockItemName,
      godown: entry.godown.tallyGodownName,
      batch: entry.batch.batchNumber,
      quantity: entry.quantity.toString(),
      unit: entry.sku.baseUom.code,
    };
  });

  const first = entries[0];
  return {
    voucherType: VOUCHER_TYPES[job.entityType],
    voucherNumber: job.entityNo,
    date: utcToDateOnly(first.createdAt),
    narration:
      job.entityType === "REVERSAL"
        ? `Reversal of ${first.referenceNo}: ${first.remarks ?? ""}`.trim()
        : `Margix ${first.referenceNo}`,
    lines,
  };
}
