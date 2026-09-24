import prisma from '../prisma';

/**
 * Core stock calculation utility.
 * As per PRD #5 and #6:
 * - Stock is godown-scoped.
 * - Current stock = SUM(ledger entries) for a given SKU × godown.
 * - Never stored as an editable field.
 */

export async function getCurrentStock(skuId: string, godownId: string): Promise<number> {
  const result = await prisma.inventoryLedger.aggregate({
    where: {
      skuId,
      godownId,
    },
    _sum: {
      quantity: true,
    },
  });

  return result._sum.quantity || 0;
}

/**
 * Fetch stock specifically for a particular batch in a godown.
 */
export async function getCurrentBatchStock(batchId: string, godownId: string): Promise<number> {
  const result = await prisma.inventoryLedger.aggregate({
    where: {
      batchId,
      godownId,
    },
    _sum: { quantity: true },
  });
  return result._sum.quantity || 0;
}

/**
 * Fetch detailed stock breakdown across all godowns for an SKU.
 */
export async function getStockBreakdown(skuId: string) {
  const ledgers = await prisma.inventoryLedger.groupBy({
    by: ['godownId'],
    where: { skuId },
    _sum: { quantity: true },
  });

  return ledgers.map(l => ({
    godownId: l.godownId,
    quantity: l._sum.quantity || 0,
  }));
}

/**
 * Fetch total stock across all godowns for an SKU (Internal use only, 
 * UI should prefer godown-scoped queries as per #5)
 */
export async function getTotalTenantStock(skuId: string): Promise<number> {
  const result = await prisma.inventoryLedger.aggregate({
    where: { skuId },
    _sum: { quantity: true },
  });
  
  return result._sum.quantity || 0;
}
