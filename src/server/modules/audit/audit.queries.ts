import type { Prisma } from "@prisma/client";
import type { PageQuery } from "@/lib/validation/common";
import { prisma } from "@/server/db/client";
import { userRefSelect } from "@/server/modules/users/users.queries";

export async function listAuditLogs(query: PageQuery & { entityType?: string; entityId?: string; userId?: string }) {
  const where: Prisma.AuditLogWhereInput = {
    entityType: query.entityType,
    entityId: query.entityId,
    userId: query.userId,
    action: query.q ? { contains: query.q, mode: "insensitive" } : undefined,
  };
  const [items, total] = await prisma.$transaction([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      include: { user: { select: userRefSelect } },
    }),
    prisma.auditLog.count({ where }),
  ]);
  return { items, total };
}
