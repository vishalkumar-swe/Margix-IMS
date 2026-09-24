import { Prisma } from "@prisma/client";
import { dateOnlyToUtc, todayIst } from "@/lib/dates";
import { prisma } from "@/server/db/client";
import { ZERO, type Decimal } from "@/server/db/decimal";
import type { Tx } from "@/server/db/transaction";
import { InsufficientStockError } from "@/server/errors";
import { allocateFefo } from "./fefo";
import type { StockKey } from "./inventory.types";

/** Read models over the stock_balance projection (never the raw ledger). */

export async function getStockQuantity(key: StockKey, db: Tx = prisma): Promise<Decimal> {
  const row = await db.stockBalance.findUnique({
    where: { skuId_godownId_batchId: key },
    select: { quantity: true },
  });
  return row?.quantity ?? ZERO;
}

/**
 * Fails early (before any write) when `requested` exceeds the stock of a key.
 * The authoritative check still happens atomically when stock is posted.
 */
export async function assertStockAvailable(tx: Tx, key: StockKey, requested: Decimal): Promise<void> {
  const available = await getStockQuantity(key, tx);
  if (available.lessThan(requested)) throw await buildInsufficientStockError(tx, key, requested);
}

/** INSUFFICIENT_STOCK error with the business identifiers the spec's error format shows. */
export async function buildInsufficientStockError(
  tx: Tx,
  key: StockKey,
  requested: Decimal,
): Promise<InsufficientStockError> {
  const balance = await tx.stockBalance.findUnique({
    where: { skuId_godownId_batchId: key },
    select: { quantity: true },
  });
  const sku = await tx.sku.findUnique({ where: { id: key.skuId }, select: { code: true } });
  const godown = await tx.godown.findUnique({ where: { id: key.godownId }, select: { code: true } });
  const batch = await tx.batch.findUnique({ where: { id: key.batchId }, select: { batchNumber: true } });

  return new InsufficientStockError({
    sku: sku?.code ?? key.skuId,
    godown: godown?.code ?? key.godownId,
    batch: batch?.batchNumber ?? key.batchId,
    available: (balance?.quantity ?? ZERO).toString(),
    requested: requested.toString(),
  });
}

export async function hasStockOnHand(
  where: { skuId?: string; godownId?: string },
  db: Tx = prisma,
): Promise<boolean> {
  const row = await db.stockBalance.findFirst({
    where: { ...where, quantity: { gt: 0 } },
    select: { skuId: true },
  });
  return row !== null;
}

export interface StockListFilters {
  godownId?: string;
  skuId?: string;
  q?: string;
  includeZero?: boolean;
  page: number;
  pageSize: number;
}

export async function listStockBalances(filters: StockListFilters) {
  const where: Prisma.StockBalanceWhereInput = {
    godownId: filters.godownId,
    skuId: filters.skuId,
    quantity: filters.includeZero ? undefined : { gt: 0 },
    OR: filters.q
      ? [
          { sku: { code: { contains: filters.q, mode: "insensitive" } } },
          { sku: { name: { contains: filters.q, mode: "insensitive" } } },
          { batch: { batchNumber: { contains: filters.q, mode: "insensitive" } } },
        ]
      : undefined,
  };

  const [items, total] = await prisma.$transaction([
    prisma.stockBalance.findMany({
      where,
      orderBy: [{ sku: { code: "asc" } }, { godown: { code: "asc" } }, { batch: { expiryDate: "asc" } }],
      skip: (filters.page - 1) * filters.pageSize,
      take: filters.pageSize,
      select: {
        quantity: true,
        updatedAt: true,
        sku: { select: { id: true, code: true, name: true, baseUom: { select: { code: true } } } },
        godown: { select: { id: true, code: true, name: true } },
        batch: { select: { id: true, batchNumber: true, expiryDate: true } },
      },
    }),
    prisma.stockBalance.count({ where }),
  ]);
  return { items, total };
}

/** Stock of one SKU broken down by godown and by godown + batch. */
export async function getSkuStock(skuId: string) {
  const balances = await prisma.stockBalance.findMany({
    where: { skuId, quantity: { gt: 0 } },
    orderBy: [{ godown: { code: "asc" } }, { batch: { expiryDate: "asc" } }],
    select: {
      quantity: true,
      godown: { select: { id: true, code: true, name: true } },
      batch: { select: { id: true, batchNumber: true, expiryDate: true, manufacturingDate: true } },
    },
  });

  const byGodown = new Map<string, { godown: (typeof balances)[number]["godown"]; quantity: Decimal }>();
  let total = ZERO;
  for (const row of balances) {
    total = total.plus(row.quantity);
    const entry = byGodown.get(row.godown.id);
    if (entry) entry.quantity = entry.quantity.plus(row.quantity);
    else byGodown.set(row.godown.id, { godown: row.godown, quantity: row.quantity });
  }

  return { total, byGodown: [...byGodown.values()], byBatch: balances };
}

/** All batches ever recorded for a SKU (for pickers and history). */
export function listBatchesForSku(skuId: string) {
  return prisma.batch.findMany({
    where: { skuId },
    orderBy: [{ expiryDate: { sort: "asc", nulls: "last" } }, { batchNumber: "asc" }],
  });
}

/** Batches with stock for a SKU in a godown, earliest expiry first (FEFO order). */
export async function listAvailableBatches(skuId: string, godownId: string) {
  return prisma.stockBalance.findMany({
    where: { skuId, godownId, quantity: { gt: 0 } },
    orderBy: [{ batch: { expiryDate: { sort: "asc", nulls: "last" } } }, { batch: { batchNumber: "asc" } }],
    select: {
      quantity: true,
      batch: { select: { id: true, batchNumber: true, expiryDate: true, manufacturingDate: true } },
    },
  });
}

/** FEFO pick suggestion for a quantity of a SKU in a godown (never from expired batches). */
export async function suggestFefoPick(skuId: string, godownId: string, requested: Decimal) {
  const batches = await listAvailableBatches(skuId, godownId);
  return allocateFefo(
    batches.map((b) => ({
      batchId: b.batch.id,
      batchNumber: b.batch.batchNumber,
      expiryDate: b.batch.expiryDate,
      quantity: b.quantity,
    })),
    requested,
    dateOnlyToUtc(todayIst()),
  );
}
