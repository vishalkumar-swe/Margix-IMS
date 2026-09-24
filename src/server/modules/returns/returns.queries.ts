import type { Prisma } from "@prisma/client";
import type { PageQuery } from "@/lib/validation/common";
import { prisma } from "@/server/db/client";
import { userRefSelect } from "@/server/modules/users/users.queries";

export async function listSalesReturns(query: PageQuery) {
  const where: Prisma.SalesReturnWhereInput = query.q
    ? {
        OR: [
          { returnNumber: { contains: query.q, mode: "insensitive" } },
          { outward: { outwardNumber: { contains: query.q, mode: "insensitive" } } },
          { customer: { name: { contains: query.q, mode: "insensitive" } } },
        ],
      }
    : {};
  const [items, total] = await prisma.$transaction([
    prisma.salesReturn.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      select: {
        id: true,
        returnNumber: true,
        status: true,
        returnedAt: true,
        reason: true,
        outward: { select: { id: true, outwardNumber: true } },
        customer: { select: { name: true } },
        godown: { select: { code: true } },
        createdBy: { select: userRefSelect },
        _count: { select: { items: true } },
      },
    }),
    prisma.salesReturn.count({ where }),
  ]);
  return { items, total };
}

export async function listPurchaseReturns(query: PageQuery) {
  const where: Prisma.PurchaseReturnWhereInput = query.q
    ? {
        OR: [
          { returnNumber: { contains: query.q, mode: "insensitive" } },
          { grn: { grnNumber: { contains: query.q, mode: "insensitive" } } },
          { supplier: { name: { contains: query.q, mode: "insensitive" } } },
        ],
      }
    : {};
  const [items, total] = await prisma.$transaction([
    prisma.purchaseReturn.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      select: {
        id: true,
        returnNumber: true,
        status: true,
        returnedAt: true,
        reason: true,
        grn: { select: { id: true, grnNumber: true } },
        supplier: { select: { name: true } },
        godown: { select: { code: true } },
        createdBy: { select: userRefSelect },
        _count: { select: { items: true } },
      },
    }),
    prisma.purchaseReturn.count({ where }),
  ]);
  return { items, total };
}

export function getSalesReturnDetail(id: string) {
  return prisma.salesReturn.findUnique({
    where: { id },
    include: {
      outward: { select: { id: true, outwardNumber: true } },
      customer: { select: { name: true, code: true } },
      godown: { select: { code: true, name: true } },
      createdBy: { select: userRefSelect },
    },
  });
}

export function getPurchaseReturnDetail(id: string) {
  return prisma.purchaseReturn.findUnique({
    where: { id },
    include: {
      grn: { select: { id: true, grnNumber: true } },
      supplier: { select: { name: true, code: true } },
      godown: { select: { code: true, name: true } },
      createdBy: { select: userRefSelect },
    },
  });
}

/** Dispatch lines that can still be returned (for the sales-return form). */
export function getReturnableDispatch(outwardId: string) {
  return prisma.outward.findUnique({
    where: { id: outwardId },
    select: {
      id: true,
      outwardNumber: true,
      godownId: true,
      customer: { select: { name: true } },
      items: {
        select: {
          id: true,
          quantity: true,
          returnedQty: true,
          sku: { select: { id: true, code: true, name: true, isBatchTracked: true, baseUom: true } },
          batch: { select: { batchNumber: true } },
          ledgerEntry: { select: { reversedBy: { select: { id: true } } } },
        },
      },
    },
  });
}

/** GRN lines that can still be returned (for the purchase-return form). */
export function getReturnableGrn(grnId: string) {
  return prisma.grn.findUnique({
    where: { id: grnId },
    select: {
      id: true,
      grnNumber: true,
      godownId: true,
      purchaseOrder: { select: { supplier: { select: { name: true } } } },
      items: {
        select: {
          id: true,
          acceptedQty: true,
          returnedQty: true,
          sku: { select: { id: true, code: true, name: true, isBatchTracked: true, baseUom: true } },
          batch: { select: { batchNumber: true } },
          ledgerEntry: { select: { reversedBy: { select: { id: true } } } },
        },
      },
    },
  });
}
