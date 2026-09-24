import type { AdjustmentStatus, Prisma } from "@prisma/client";
import type { PageQuery } from "@/lib/validation/common";
import { prisma } from "@/server/db/client";
import { userRefSelect } from "@/server/modules/users/users.queries";

export async function listAdjustments(query: PageQuery & { status?: AdjustmentStatus }) {
  const where: Prisma.AdjustmentWhereInput = {
    status: query.status,
    adjustmentNumber: query.q ? { contains: query.q, mode: "insensitive" } : undefined,
  };
  const [items, total] = await prisma.$transaction([
    prisma.adjustment.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      select: {
        id: true,
        adjustmentNumber: true,
        status: true,
        reasonCode: true,
        reasonNote: true,
        submittedAt: true,
        reviewedAt: true,
        godown: { select: { code: true, name: true } },
        submittedBy: { select: userRefSelect },
        reviewedBy: { select: userRefSelect },
        _count: { select: { items: true } },
      },
    }),
    prisma.adjustment.count({ where }),
  ]);
  return { items, total };
}

export function getAdjustmentDetail(id: string) {
  return prisma.adjustment.findUnique({
    where: { id },
    include: {
      godown: { select: { id: true, code: true, name: true } },
      submittedBy: { select: userRefSelect },
      reviewedBy: { select: userRefSelect },
      items: {
        orderBy: { id: "asc" },
        include: {
          sku: { select: { id: true, code: true, name: true, baseUom: { select: { code: true } } } },
          batch: { select: { id: true, batchNumber: true } },
          ledgerEntry: { select: { id: true, entryNo: true, reversedBy: { select: { id: true, entryNo: true } } } },
        },
      },
    },
  });
}

export function countPendingAdjustments() {
  return prisma.adjustment.count({ where: { status: "SUBMITTED" } });
}
