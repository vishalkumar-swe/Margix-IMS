import type { Prisma } from "@prisma/client";
import type { PageQuery } from "@/lib/validation/common";
import { prisma } from "@/server/db/client";
import { userRefSelect } from "@/server/modules/users/users.queries";

export async function listTransfers(query: PageQuery & { godownId?: string }) {
  const where: Prisma.TransferWhereInput = {
    OR: query.godownId ? [{ fromGodownId: query.godownId }, { toGodownId: query.godownId }] : undefined,
    transferNumber: query.q ? { contains: query.q, mode: "insensitive" } : undefined,
  };
  const [items, total] = await prisma.$transaction([
    prisma.transfer.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      select: {
        id: true,
        transferNumber: true,
        status: true,
        transferredAt: true,
        fromGodown: { select: { code: true, name: true } },
        toGodown: { select: { code: true, name: true } },
        createdBy: { select: userRefSelect },
        _count: { select: { items: true } },
      },
    }),
    prisma.transfer.count({ where }),
  ]);
  return { items, total };
}

export function getTransferDetail(id: string) {
  return prisma.transfer.findUnique({
    where: { id },
    include: {
      fromGodown: { select: { id: true, code: true, name: true } },
      toGodown: { select: { id: true, code: true, name: true } },
      createdBy: { select: userRefSelect },
    },
  });
}
