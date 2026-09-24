import type { Prisma } from "@prisma/client";
import { addDays, istDayStart } from "@/lib/dates";
import type { AuditQuery } from "@/lib/validation/audit";
import { prisma } from "@/server/db/client";
import { userRefSelect } from "@/server/modules/users/users.queries";

export async function listAuditLogs(query: AuditQuery) {
  const where: Prisma.AuditLogWhereInput = {
    action: query.action,
    entityType: query.entityType,
    entityId: query.entityId,
    userId: query.userId,
    createdAt:
      query.from || query.to
        ? {
            gte: query.from ? istDayStart(query.from) : undefined,
            lt: query.to ? istDayStart(addDays(query.to, 1)) : undefined,
          }
        : undefined,
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

/** Distinct values for the audit filters. */
export async function listAuditFacets() {
  const [actions, entityTypes] = await Promise.all([
    prisma.auditLog.findMany({ distinct: ["action"], select: { action: true }, orderBy: { action: "asc" } }),
    prisma.auditLog.findMany({ distinct: ["entityType"], select: { entityType: true }, orderBy: { entityType: "asc" } }),
  ]);
  return { actions: actions.map((a) => a.action), entityTypes: entityTypes.map((e) => e.entityType) };
}
