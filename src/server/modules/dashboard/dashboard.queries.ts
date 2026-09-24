import { dateOnlyToUtc, todayIst } from "@/lib/dates";
import { prisma } from "@/server/db/client";
import { countPendingAdjustments } from "@/server/modules/adjustments/adjustments.queries";
import { ledgerEntrySelect } from "@/server/modules/inventory/ledger.queries";
import { countTallyJobsByStatus } from "@/server/modules/tally/tally.queries";

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const EXPIRY_WINDOW_DAYS = 30;

/** Operational indicators for the dashboard (spec §6.6), plus exceptions (§6.8). */
export async function getDashboardSummary() {
  const todayStartUtc = new Date(dateOnlyToUtc(todayIst()).getTime() - IST_OFFSET_MS);
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
    godowns: godownStock
      .map((g) => ({ godown: godownById.get(g.godownId)!, stockLines: g._count._all }))
      .sort((a, b) => a.godown.code.localeCompare(b.godown.code)),
  };
}
