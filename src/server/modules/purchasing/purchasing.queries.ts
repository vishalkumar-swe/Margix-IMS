import type { Prisma, PurchaseOrderStatus } from "@prisma/client";
import type { PageQuery } from "@/lib/validation/common";
import { prisma } from "@/server/db/client";
import { userRefSelect } from "@/server/modules/users/users.queries";

export async function listPurchaseOrders(
  query: PageQuery & { status?: PurchaseOrderStatus; supplierId?: string; skuId?: string },
) {
  const where: Prisma.PurchaseOrderWhereInput = {
    status: query.status,
    supplierId: query.supplierId,
    items: query.skuId ? { some: { skuId: query.skuId } } : undefined,
    OR: query.q
      ? [
          { poNumber: { contains: query.q, mode: "insensitive" } },
          { supplier: { name: { contains: query.q, mode: "insensitive" } } },
        ]
      : undefined,
  };
  const [items, total] = await prisma.$transaction([
    prisma.purchaseOrder.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      select: {
        id: true,
        poNumber: true,
        status: true,
        orderDate: true,
        expectedDate: true,
        createdAt: true,
        supplier: { select: { id: true, code: true, name: true } },
        createdBy: { select: userRefSelect },
        _count: { select: { items: true, grns: true } },
      },
    }),
    prisma.purchaseOrder.count({ where }),
  ]);
  return { items, total };
}

export function getPurchaseOrderDetail(id: string) {
  return prisma.purchaseOrder.findUnique({
    where: { id },
    include: {
      supplier: true,
      createdBy: { select: userRefSelect },
      cancelledBy: { select: userRefSelect },
      closedBy: { select: userRefSelect },
      items: {
        orderBy: { lineNo: "asc" },
        include: {
          sku: {
            select: {
              id: true,
              code: true,
              name: true,
              isBatchTracked: true,
              baseUomId: true,
              baseUom: true,
              units: { select: { uomId: true, factor: true, uom: { select: { code: true } } }, orderBy: { factor: "asc" } },
            },
          },
          entryUom: { select: { code: true } },
        },
      },
      grns: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          grnNumber: true,
          status: true,
          receivedAt: true,
          godown: { select: { code: true, name: true } },
          createdBy: { select: userRefSelect },
        },
      },
    },
  });
}

export async function listGrns(query: PageQuery & { purchaseOrderId?: string; skuId?: string }) {
  const where: Prisma.GrnWhereInput = {
    purchaseOrderId: query.purchaseOrderId,
    items: query.skuId ? { some: { skuId: query.skuId } } : undefined,
    OR: query.q
      ? [
          { grnNumber: { contains: query.q, mode: "insensitive" } },
          { purchaseOrder: { poNumber: { contains: query.q, mode: "insensitive" } } },
        ]
      : undefined,
  };
  const [items, total] = await prisma.$transaction([
    prisma.grn.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      select: {
        id: true,
        grnNumber: true,
        status: true,
        receivedAt: true,
        supplierInvoiceNo: true,
        purchaseOrder: { select: { id: true, poNumber: true, supplier: { select: { name: true } } } },
        godown: { select: { code: true, name: true } },
        createdBy: { select: userRefSelect },
        _count: { select: { items: true } },
      },
    }),
    prisma.grn.count({ where }),
  ]);
  return { items, total };
}

export function getGrnDetail(id: string) {
  return prisma.grn.findUnique({
    where: { id },
    include: {
      purchaseOrder: { select: { id: true, poNumber: true, supplier: { select: { code: true, name: true } } } },
      godown: { select: { id: true, code: true, name: true } },
      createdBy: { select: userRefSelect },
      items: {
        orderBy: { id: "asc" },
        include: {
          sku: { select: { id: true, code: true, name: true, baseUom: { select: { code: true } } } },
          batch: { select: { id: true, batchNumber: true, expiryDate: true, manufacturingDate: true } },
          ledgerEntry: { select: { id: true, entryNo: true, reversedBy: { select: { id: true, entryNo: true } } } },
        },
      },
    },
  });
}
