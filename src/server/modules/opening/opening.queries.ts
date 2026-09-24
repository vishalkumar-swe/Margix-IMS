import type { Prisma } from "@prisma/client";
import type { OpeningLineListQuery } from "@/lib/validation/opening";
import { prisma } from "@/server/db/client";
import { userRefSelect } from "@/server/modules/users/users.queries";

export function listOpeningBalances() {
  return prisma.openingBalance.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      openingNumber: true,
      status: true,
      asOf: true,
      remarks: true,
      createdAt: true,
      godown: { select: { code: true, name: true } },
      createdBy: { select: userRefSelect },
      _count: { select: { items: true } },
    },
  });
}

/**
 * Every posted opening line, newest first, for the opening stock register:
 * searchable by SKU, batch or document, filterable by godown and by whether
 * the line is still in effect or was removed/corrected.
 */
export async function listOpeningLines(query: OpeningLineListQuery) {
  const where: Prisma.OpeningBalanceItemWhereInput = {
    openingBalance: query.godownId ? { godownId: query.godownId } : undefined,
    ledgerEntry:
      query.state === "active"
        ? { reversedBy: { is: null } }
        : query.state === "reversed"
          ? { reversedBy: { isNot: null } }
          : undefined,
    OR: query.q
      ? [
          { sku: { code: { contains: query.q, mode: "insensitive" } } },
          { sku: { name: { contains: query.q, mode: "insensitive" } } },
          { batch: { batchNumber: { contains: query.q, mode: "insensitive" } } },
          { sku: { barcode: query.q.trim() } },
          { openingBalance: { openingNumber: { contains: query.q, mode: "insensitive" } } },
        ]
      : undefined,
  };
  const [items, total] = await prisma.$transaction([
    prisma.openingBalanceItem.findMany({
      where,
      orderBy: [{ ledgerEntry: { entryNo: "desc" } }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      select: {
        id: true,
        quantity: true,
        sku: { select: { id: true, code: true, name: true, isBatchTracked: true, baseUom: { select: { code: true } } } },
        batch: { select: { id: true, batchNumber: true, manufacturingDate: true, expiryDate: true } },
        openingBalance: {
          select: {
            id: true,
            openingNumber: true,
            asOf: true,
            remarks: true,
            createdAt: true,
            godown: { select: { id: true, code: true, name: true } },
            createdBy: { select: userRefSelect },
          },
        },
        ledgerEntry: {
          select: {
            id: true,
            entryNo: true,
            reversedBy: { select: { entryNo: true, remarks: true, createdAt: true, createdBy: { select: userRefSelect } } },
          },
        },
        replaces: { select: { openingBalance: { select: { openingNumber: true } } } },
        replacedBy: { select: { openingBalance: { select: { openingNumber: true } } } },
      },
    }),
    prisma.openingBalanceItem.count({ where }),
  ]);
  return { items, total };
}
