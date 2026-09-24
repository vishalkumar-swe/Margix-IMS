import { Prisma, type NotificationAlertType, type StockAlertStatus } from "@prisma/client";
import type { PageQuery } from "@/lib/validation/common";
import { prisma } from "@/server/db/client";

const skuRef = { select: { id: true, code: true, name: true, baseUom: { select: { code: true } } } } as const;
const godownRef = { select: { id: true, code: true, name: true } } as const;

export async function listStockAlerts(
  query: PageQuery & { status: StockAlertStatus; type: NotificationAlertType; godownId?: string },
) {
  const where: Prisma.StockAlertWhereInput = {
    status: query.status,
    alertType: query.type,
    godownId: query.godownId,
    sku: query.q
      ? {
          OR: [
            { code: { contains: query.q, mode: "insensitive" } },
            { name: { contains: query.q, mode: "insensitive" } },
          ],
        }
      : undefined,
  };
  const [items, total] = await prisma.$transaction([
    prisma.stockAlert.findMany({
      where,
      orderBy:
        query.status === "RESOLVED"
          ? { resolvedAt: "desc" }
          : query.type === "SLOW_MOVING"
            ? [{ daysIdle: "desc" }, { createdAt: "asc" }]
            : { createdAt: "asc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      include: { sku: skuRef, godown: godownRef },
    }),
    prisma.stockAlert.count({ where }),
  ]);
  return { items, total };
}

export function countActiveAlerts() {
  return prisma.stockAlert.count({ where: { status: "ACTIVE", alertType: "LOW_STOCK" } });
}

/**
 * Quantity to reorder for a SKU, used to pre-fill a purchase order: what it
 * takes to bring every godown with an active reorder rule back up to its
 * level. Null when there is no rule or nothing is short.
 */
export async function suggestedReorderQuantity(skuId: string): Promise<string | null> {
  const rules = await prisma.reorderRule.findMany({ where: { skuId, isActive: true }, select: { godownId: true, reorderLevel: true } });
  if (rules.length === 0) return null;
  const stock = await prisma.stockBalance.groupBy({
    by: ["godownId"],
    where: { skuId, godownId: { in: rules.map((r) => r.godownId) } },
    _sum: { quantity: true },
  });
  const onHand = new Map(stock.map((s) => [s.godownId, s._sum.quantity]));
  const shortfall = rules.reduce((total, rule) => {
    const gap = rule.reorderLevel.minus(onHand.get(rule.godownId) ?? 0);
    return gap.greaterThan(0) ? total.plus(gap) : total;
  }, new Prisma.Decimal(0));
  return shortfall.greaterThan(0) ? shortfall.toString() : null;
}

export function listReorderRules() {
  return prisma.reorderRule.findMany({
    orderBy: [{ sku: { code: "asc" } }, { godown: { code: "asc" } }],
    include: { sku: skuRef, godown: godownRef },
  });
}
