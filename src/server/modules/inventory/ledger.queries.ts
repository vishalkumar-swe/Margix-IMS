import type { Prisma } from "@prisma/client";
import type { LedgerQuery } from "@/lib/validation/ledger";
import { prisma } from "@/server/db/client";
import { userRefSelect } from "@/server/modules/users/users.queries";

export const ledgerEntrySelect = {
  id: true,
  entryNo: true,
  movementType: true,
  quantity: true,
  balanceAfter: true,
  referenceType: true,
  referenceId: true,
  referenceNo: true,
  reasonCode: true,
  remarks: true,
  createdAt: true,
  sku: { select: { id: true, code: true, name: true, baseUom: { select: { code: true } } } },
  godown: { select: { id: true, code: true, name: true } },
  batch: { select: { id: true, batchNumber: true } },
  createdBy: { select: userRefSelect },
  reversesEntry: { select: { id: true, entryNo: true } },
  reversedBy: { select: { id: true, entryNo: true } },
} satisfies Prisma.InventoryLedgerSelect;

export type LedgerEntryView = Prisma.InventoryLedgerGetPayload<{ select: typeof ledgerEntrySelect }>;

/** Ledger entries newest first with keyset pagination on entryNo. */
export async function listLedgerEntries(query: LedgerQuery) {
  const items = await prisma.inventoryLedger.findMany({
    where: {
      skuId: query.skuId,
      godownId: query.godownId,
      batchId: query.batchId,
      movementType: query.movementType,
      referenceNo: query.referenceNo ? { contains: query.referenceNo, mode: "insensitive" } : undefined,
      entryNo: query.cursor ? { lt: query.cursor } : undefined,
    },
    orderBy: { entryNo: "desc" },
    take: query.limit + 1,
    select: ledgerEntrySelect,
  });

  const hasMore = items.length > query.limit;
  const page = hasMore ? items.slice(0, query.limit) : items;
  return { items: page, nextCursor: hasMore ? page[page.length - 1].entryNo : null };
}

/** All entries of one document (for document detail pages). */
export function listEntriesForDocument(referenceId: string) {
  return prisma.inventoryLedger.findMany({
    where: { referenceId },
    orderBy: { entryNo: "asc" },
    select: ledgerEntrySelect,
  });
}
