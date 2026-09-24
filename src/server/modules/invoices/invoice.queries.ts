import type { InvoiceStatus, Prisma } from "@prisma/client";
import type { PageQuery } from "@/lib/validation/common";
import { prisma } from "@/server/db/client";
import { userRefSelect } from "@/server/modules/users/users.queries";

export async function listInvoices(query: PageQuery & { status?: InvoiceStatus; customerId?: string; skuId?: string }) {
  const where: Prisma.InvoiceWhereInput = {
    status: query.status,
    customerId: query.customerId,
    items: query.skuId ? { some: { skuId: query.skuId } } : undefined,
    OR: query.q
      ? [
          { invoiceNumber: { contains: query.q, mode: "insensitive" } },
          { customer: { name: { contains: query.q, mode: "insensitive" } } },
        ]
      : undefined,
  };
  const [items, total] = await prisma.$transaction([
    prisma.invoice.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      select: {
        id: true,
        invoiceNumber: true,
        invoiceDate: true,
        status: true,
        customer: { select: { id: true, code: true, name: true } },
        createdBy: { select: userRefSelect },
        _count: { select: { items: true, outwards: true } },
      },
    }),
    prisma.invoice.count({ where }),
  ]);
  return { items, total };
}

export function getInvoiceDetail(id: string) {
  return prisma.invoice.findUnique({
    where: { id },
    include: {
      customer: true,
      createdBy: { select: userRefSelect },
      cancelledBy: { select: userRefSelect },
      items: {
        orderBy: { lineNo: "asc" },
        include: {
          sku: { select: { id: true, code: true, name: true, isBatchTracked: true, baseUom: true } },
          entryUom: { select: { code: true } },
        },
      },
      outwards: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          outwardNumber: true,
          status: true,
          dispatchedAt: true,
          godown: { select: { code: true, name: true } },
          createdBy: { select: userRefSelect },
        },
      },
    },
  });
}

/** Invoices that can still be dispatched against (for the dispatch form). */
export function listOpenInvoices() {
  return prisma.invoice.findMany({
    where: { status: { in: ["OPEN", "PARTIALLY_DISPATCHED"] } },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      invoiceNumber: true,
      customerId: true,
      customer: { select: { name: true } },
      items: { select: { skuId: true, quantity: true, dispatchedQty: true } },
    },
  });
}
