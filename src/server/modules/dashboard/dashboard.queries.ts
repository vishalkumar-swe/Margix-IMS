import { istDayStart, todayIst } from "@/lib/dates";
import { prisma } from "@/server/db/client";
import { countPendingAdjustments } from "@/server/modules/adjustments/adjustments.queries";
import { countActiveAlerts } from "@/server/modules/alerts/alerts.queries";
import { ledgerEntrySelect } from "@/server/modules/inventory/ledger.queries";
import { countTallyJobsByStatus } from "@/server/modules/tally/tally.queries";

const EXPIRY_WINDOW_DAYS = 30;

/** Operational indicators for the dashboard (spec §6.6), plus exceptions (§6.8). */
export async function getDashboardSummary() {
  const todayStartUtc = istDayStart(todayIst());
  const expiryHorizon = new Date(Date.now() + EXPIRY_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const [
    activeSkus,
    stockLines,
    inwardToday,
    outwardToday,
    pendingAdjustments,
    openPurchaseOrders,
    tally,
    recentMovements,
    expiringBatches,
    godownStock,
    exceptions,
  ] = await Promise.all([
    prisma.sku.count({ where: { status: "ACTIVE" } }),
    prisma.stockBalance.count({ where: { quantity: { gt: 0 } } }),
    prisma.inventoryLedger.count({
      where: { movementType: { in: ["INWARD", "OPENING"] }, createdAt: { gte: todayStartUtc } },
    }),
    prisma.inventoryLedger.count({ where: { movementType: "OUTWARD", createdAt: { gte: todayStartUtc } } }),
    countPendingAdjustments(),
    prisma.purchaseOrder.count({ where: { status: { in: ["OPEN", "PARTIALLY_RECEIVED"] } } }),
    countTallyJobsByStatus(),
    prisma.inventoryLedger.findMany({ orderBy: { entryNo: "desc" }, take: 10, select: ledgerEntrySelect }),
    prisma.stockBalance.findMany({
      where: { quantity: { gt: 0 }, batch: { expiryDate: { not: null, lte: expiryHorizon } } },
      orderBy: { batch: { expiryDate: "asc" } },
      take: 10,
      select: {
        quantity: true,
        sku: { select: { id: true, code: true, name: true, baseUom: { select: { code: true } } } },
        godown: { select: { code: true } },
        batch: { select: { batchNumber: true, expiryDate: true } },
      },
    }),
    prisma.stockBalance.groupBy({
      by: ["godownId"],
      where: { quantity: { gt: 0 } },
      _count: { _all: true },
    }),
    getExceptionCounts(),
  ]);

  const godowns = await prisma.godown.findMany({
    where: { id: { in: godownStock.map((g) => g.godownId) } },
    select: { id: true, code: true, name: true },
  });
  const godownById = new Map(godowns.map((g) => [g.id, g]));

  return {
    activeSkus,
    stockLines,
    inwardToday,
    outwardToday,
    pendingAdjustments,
    openPurchaseOrders,
    tally,
    recentMovements,
    expiringBatches,
    exceptions,
    godowns: godownStock
      .map((g) => ({ godown: godownById.get(g.godownId)!, stockLines: g._count._all }))
      .sort((a, b) => a.godown.code.localeCompare(b.godown.code)),
  };
}

/**
 * Exceptions as first-class business objects (spec §6.8): things someone must
 * act on, surfaced on the dashboard rather than buried in logs.
 */
async function getExceptionCounts() {
  const [lowStock, invoicesAwaitingDispatch, unmappedSkus, unmappedGodowns] = await Promise.all([
    countActiveAlerts(),
    prisma.invoice.count({ where: { status: { in: ["OPEN", "PARTIALLY_DISPATCHED"] } } }),
    prisma.sku.count({ where: { status: "ACTIVE", tallyStockItemName: null } }),
    prisma.godown.count({ where: { isActive: true, tallySyncEnabled: true, tallyGodownName: null } }),
  ]);
  return { lowStock, invoicesAwaitingDispatch, unmappedSkus, unmappedGodowns };
}
