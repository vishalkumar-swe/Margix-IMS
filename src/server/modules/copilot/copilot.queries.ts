import { prisma } from "@/server/db/client";
import type { WorkspaceCounts } from "@/lib/copilot/types";

/**
 * Small, cheap read model behind the Copilot guardrails and completion report.
 * Deliberately counts only; it must not turn a question into a full report.
 */
export async function getWorkspaceCounts(): Promise<WorkspaceCounts> {
  const [
    activeSkus,
    stockLines,
    godowns,
    openPurchaseOrders,
    grns,
    openInvoices,
    dispatches,
    lowStockAlerts,
    pendingTally,
    latestSku,
    latestOpenPurchaseOrder,
    latestInvoice,
    latestOpenInvoice,
    latestDispatch,
  ] = await Promise.all([
    prisma.sku.count({ where: { status: "ACTIVE" } }),
    prisma.stockBalance.count({ where: { quantity: { gt: 0 } } }),
    prisma.godown.count({ where: { isActive: true } }),
    prisma.purchaseOrder.count({ where: { status: { in: ["OPEN", "PARTIALLY_RECEIVED"] } } }),
    prisma.grn.count(),
    prisma.invoice.count({ where: { status: { in: ["OPEN", "PARTIALLY_DISPATCHED"] } } }),
    prisma.outward.count(),
    prisma.stockAlert.count({ where: { status: "ACTIVE", alertType: "LOW_STOCK" } }),
    prisma.tallySyncJob.count({ where: { status: { in: ["PENDING", "IN_PROGRESS", "FAILED"] } } }),
    prisma.sku.findFirst({ where: { status: "ACTIVE" }, orderBy: { createdAt: "desc" }, select: { id: true } }),
    prisma.purchaseOrder.findFirst({
      where: { status: { in: ["OPEN", "PARTIALLY_RECEIVED"] } },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    }),
    prisma.invoice.findFirst({ orderBy: { createdAt: "desc" }, select: { id: true } }),
    prisma.invoice.findFirst({
      where: { status: { in: ["OPEN", "PARTIALLY_DISPATCHED"] } },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    }),
    prisma.outward.findFirst({ orderBy: { createdAt: "desc" }, select: { id: true } }),
  ]);

  return {
    activeSkus,
    stockLines,
    godowns,
    openPurchaseOrders,
    grns,
    openInvoices,
    dispatches,
    lowStockAlerts,
    pendingTally,
    latestSkuId: latestSku?.id ?? null,
    latestOpenPurchaseOrderId: latestOpenPurchaseOrder?.id ?? null,
    latestInvoiceId: latestInvoice?.id ?? null,
    latestOpenInvoiceId: latestOpenInvoice?.id ?? null,
    latestDispatchId: latestDispatch?.id ?? null,
  };
}
