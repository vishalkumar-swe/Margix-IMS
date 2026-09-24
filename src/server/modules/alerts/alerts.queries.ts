import type { Prisma, StockAlertStatus } from "@prisma/client";
import type { PageQuery } from "@/lib/validation/common";
import { prisma } from "@/server/db/client";

const skuRef = { select: { id: true, code: true, name: true, baseUom: { select: { code: true } } } } as const;
const godownRef = { select: { id: true, code: true, name: true } } as const;

export async function listStockAlerts(query: PageQuery & { status: StockAlertStatus; godownId?: string }) {
  const where: Prisma.StockAlertWhereInput = {
    status: query.status,
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
      orderBy: query.status === "ACTIVE" ? { createdAt: "asc" } : { resolvedAt: "desc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      include: { sku: skuRef, godown: godownRef },
    }),
    prisma.stockAlert.count({ where }),
  ]);
  return { items, total };
}

export function countActiveAlerts() {
  return prisma.stockAlert.count({ where: { status: "ACTIVE" } });
}

export function listReorderRules() {
  return prisma.reorderRule.findMany({
    orderBy: [{ sku: { code: "asc" } }, { godown: { code: "asc" } }],
    include: { sku: skuRef, godown: godownRef },
  });
}
