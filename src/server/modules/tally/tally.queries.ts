import type { Prisma, TallySyncStatus } from "@prisma/client";
import type { PageQuery } from "@/lib/validation/common";
import { prisma } from "@/server/db/client";

export async function listTallyJobs(query: PageQuery & { status?: TallySyncStatus }) {
  const where: Prisma.TallySyncJobWhereInput = {
    status: query.status,
    entityNo: query.q ? { contains: query.q, mode: "insensitive" } : undefined,
  };
  const [items, total] = await prisma.$transaction([
    prisma.tallySyncJob.findMany({
      where,
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.tallySyncJob.count({ where }),
  ]);
  return { items, total };
}

export async function countTallyJobsByStatus(): Promise<Record<TallySyncStatus, number>> {
  const groups = await prisma.tallySyncJob.groupBy({ by: ["status"], _count: { _all: true } });
  const counts: Record<TallySyncStatus, number> = { PENDING: 0, IN_PROGRESS: 0, SYNCED: 0, FAILED: 0 };
  for (const g of groups) counts[g.status] = g._count._all;
  return counts;
}
