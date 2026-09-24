import type { Prisma } from "@prisma/client";
import type { PageQuery } from "@/lib/validation/common";
import { prisma } from "@/server/db/client";
import { userRefSelect } from "@/server/modules/users/users.queries";

export async function listDispatches(query: PageQuery & { godownId?: string }) {
  const where: Prisma.OutwardWhereInput = {
    godownId: query.godownId,
    OR: query.q
      ? [
          { outwardNumber: { contains: query.q, mode: "insensitive" } },
          { referenceNo: { contains: query.q, mode: "insensitive" } },
          { customer: { name: { contains: query.q, mode: "insensitive" } } },
        ]
      : undefined,
  };
  const [items, total] = await prisma.$transaction([
    prisma.outward.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      select: {
        id: true,
        outwardNumber: true,
        status: true,
        dispatchedAt: true,
        referenceNo: true,
        vehicleNo: true,
        godown: { select: { code: true, name: true } },
        customer: { select: { code: true, name: true } },
        createdBy: { select: userRefSelect },
        _count: { select: { items: true } },
      },
    }),
    prisma.outward.count({ where }),
  ]);
  return { items, total };
}

export function getDispatchDetail(id: string) {
  return prisma.outward.findUnique({
    where: { id },
    include: {
      godown: { select: { id: true, code: true, name: true } },
      customer: { select: { id: true, code: true, name: true, gstin: true, stateCode: true, address: true } },
      invoice: { select: { id: true, invoiceNumber: true, invoiceDate: true, taxType: true, placeOfSupply: true } },
      createdBy: { select: userRefSelect },
      items: {
        orderBy: { id: "asc" },
        include: {
          sku: { select: { id: true, code: true, name: true, barcode: true, baseUom: { select: { code: true } } } },
          invoiceItem: {
            select: {
              hsnCode: true,
              rate: true,
              discountPercent: true,
              gstRate: true,
              entryFactor: true,
              entryUom: { select: { code: true } },
            },
          },
          batch: { select: { id: true, batchNumber: true, expiryDate: true } },
          ledgerEntry: { select: { id: true, entryNo: true, reversedBy: { select: { id: true, entryNo: true } } } },
        },
      },
    },
  });
}
