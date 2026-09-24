import type { Prisma, Sku } from "@prisma/client";
import { prisma } from "@/server/db/client";
import type { Tx } from "@/server/db/transaction";
import { NotFoundError, ValidationError } from "@/server/errors";
import type { PageQuery } from "@/lib/validation/common";

export const skuWithUomSelect = {
  id: true,
  code: true,
  name: true,
  isBatchTracked: true,
  status: true,
  baseUomId: true,
  hsnCode: true,
  gstRate: true,
  barcode: true,
  baseUom: { select: { code: true, decimalPlaces: true } },
  units: { select: { uomId: true, factor: true, uom: { select: { code: true } } }, orderBy: { factor: "asc" } },
} satisfies Prisma.SkuSelect;

export type TransactableSku = Prisma.SkuGetPayload<{ select: typeof skuWithUomSelect }>;

/**
 * Loads the SKUs referenced by a document's lines. Archived SKUs cannot take
 * part in new transactions (their history stays visible).
 */
export async function loadTransactableSkus(tx: Tx, skuIds: string[]): Promise<Map<string, TransactableSku>> {
  const unique = [...new Set(skuIds)];
  const skus = await tx.sku.findMany({ where: { id: { in: unique } }, select: skuWithUomSelect });
  const byId = new Map(skus.map((s) => [s.id, s]));

  for (const id of unique) {
    const sku = byId.get(id);
    if (!sku) throw new NotFoundError("SKU", id);
    if (sku.status === "ARCHIVED") throw new ValidationError(`SKU ${sku.code} is archived.`, { sku: sku.code });
  }
  return byId;
}

export async function loadActiveGodown(tx: Tx, godownId: string) {
  const godown = await tx.godown.findUnique({ where: { id: godownId } });
  if (!godown) throw new NotFoundError("Godown", godownId);
  if (!godown.isActive) throw new ValidationError(`Godown ${godown.code} is inactive.`);
  return godown;
}

export async function loadActiveSupplier(tx: Tx, supplierId: string) {
  const supplier = await tx.supplier.findUnique({ where: { id: supplierId } });
  if (!supplier) throw new NotFoundError("Supplier", supplierId);
  if (!supplier.isActive) throw new ValidationError(`Supplier ${supplier.code} is inactive.`);
  return supplier;
}

export async function loadActiveCustomer(tx: Tx, customerId: string) {
  const customer = await tx.customer.findUnique({ where: { id: customerId } });
  if (!customer) throw new NotFoundError("Customer", customerId);
  if (!customer.isActive) throw new ValidationError(`Customer ${customer.code} is inactive.`);
  return customer;
}

// ---- Lists for master-data pages and pickers ----

export async function listSkus(query: PageQuery & { status?: Sku["status"] }) {
  const where: Prisma.SkuWhereInput = {
    status: query.status,
    OR: query.q
      ? [
          { code: { contains: query.q, mode: "insensitive" } },
          { name: { contains: query.q, mode: "insensitive" } },
          { barcode: query.q },
        ]
      : undefined,
  };
  const [items, total] = await prisma.$transaction([
    prisma.sku.findMany({
      where,
      orderBy: { code: "asc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      include: {
        baseUom: true,
        category: true,
        units: { include: { uom: { select: { code: true, name: true } } }, orderBy: { factor: "asc" } },
      },
    }),
    prisma.sku.count({ where }),
  ]);
  return { items, total };
}

export function getSku(id: string) {
  return prisma.sku.findUnique({ where: { id }, include: { baseUom: true, category: true } });
}

export function listGodowns(options: { activeOnly?: boolean } = {}) {
  return prisma.godown.findMany({
    where: options.activeOnly ? { isActive: true } : undefined,
    orderBy: { code: "asc" },
  });
}

export function listSuppliers(options: { activeOnly?: boolean } = {}) {
  return prisma.supplier.findMany({
    where: options.activeOnly ? { isActive: true } : undefined,
    orderBy: { name: "asc" },
  });
}

export function listCustomers(options: { activeOnly?: boolean } = {}) {
  return prisma.customer.findMany({
    where: options.activeOnly ? { isActive: true } : undefined,
    orderBy: { name: "asc" },
  });
}

export function listCategories(options: { activeOnly?: boolean } = {}) {
  return prisma.category.findMany({
    where: options.activeOnly ? { isActive: true } : undefined,
    orderBy: { name: "asc" },
    include: { hsn: { select: { code: true, gstRate: true } } },
  });
}

export function listUoms() {
  return prisma.uom.findMany({ orderBy: { code: "asc" } });
}

/**
 * The SKU a scanned value stands for: its barcode, else its code
 * (case-insensitive, as codes are stored in capitals). Any status is found,
 * so callers can say why an inactive product cannot be used.
 */
export async function findSkuByScanCode(code: string) {
  const value = code.trim();
  if (!value) return null;
  return (
    (await prisma.sku.findUnique({ where: { barcode: value }, select: skuWithUomSelect })) ??
    (await prisma.sku.findUnique({ where: { code: value.toUpperCase() }, select: skuWithUomSelect }))
  );
}

/** What a product label shows, for the given SKUs (in no particular order). */
export function listSkuLabels(ids: string[]) {
  return prisma.sku.findMany({
    where: { id: { in: [...new Set(ids)] } },
    select: { id: true, code: true, name: true, barcode: true },
  });
}

/** Compact SKU list for selects (active only). */
export function listSkuOptions() {
  return prisma.sku.findMany({
    where: { status: "ACTIVE" },
    orderBy: { code: "asc" },
    select: skuWithUomSelect,
  });
}
