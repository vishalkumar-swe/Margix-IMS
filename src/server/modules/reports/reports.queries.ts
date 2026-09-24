import { Prisma } from "@prisma/client";
import { addDays, istDayStart, startOfMonth, todayIst } from "@/lib/dates";
import type { MovementReportQuery, StockAgingQuery, StockSummaryQuery } from "@/lib/validation/reports";
import { prisma } from "@/server/db/client";
import type { Decimal } from "@/server/db/decimal";
import type { Tx } from "@/server/db/transaction";
import { ledgerEntrySelect } from "@/server/modules/inventory/ledger.queries";
import { getStockAgingSettings } from "@/server/modules/settings/stock-aging";

/** Upper bound on rows returned by one report run (CSV and screen alike). */
export const REPORT_ROW_LIMIT = 10_000;

export interface DateRange {
  from: string;
  to: string;
}

/** Defaults: month-to-date. Ranges are inclusive IST calendar days. */
export function resolveRange(query: { from?: string; to?: string }): DateRange {
  const to = query.to ?? todayIst();
  return { from: query.from ?? startOfMonth(to), to };
}

export interface StockSummaryRow {
  skuId: string;
  skuCode: string;
  skuName: string;
  unit: string;
  godownCode: string;
  godownName: string;
  batchNumber: string | null;
  opening: Decimal;
  inward: Decimal;
  outward: Decimal;
  adjustments: Decimal;
  closing: Decimal;
}

/**
 * Stock movement summary per SKU × godown (or × batch) for a period
 * (spec §6.7): Opening + Inward − Outward ± Adjustments = Closing, computed
 * from the ledger. Inward includes opening entries, transfers in and customer
 * returns; outward includes transfers out and supplier returns; adjustments
 * include reversals. The same report for a single day is the daily
 * inventory report.
 */
export async function getStockSummary(query: StockSummaryQuery): Promise<{ range: DateRange; rows: StockSummaryRow[] }> {
  const range = resolveRange(query);
  const start = istDayStart(range.from);
  const end = istDayStart(addDays(range.to, 1));
  const byBatch = query.groupBy === "batch";

  const inPeriod = Prisma.sql`l."created_at" >= ${start} AND l."created_at" < ${end}`;
  const rows = await prisma.$queryRaw<StockSummaryRow[]>`
    SELECT s."id" AS "skuId", s."code" AS "skuCode", s."name" AS "skuName", u."code" AS "unit",
           g."code" AS "godownCode", g."name" AS "godownName",
           ${byBatch ? Prisma.sql`b."batch_number"` : Prisma.sql`NULL::text`} AS "batchNumber",
           COALESCE(SUM(l."quantity") FILTER (WHERE l."created_at" < ${start}), 0) AS "opening",
           COALESCE(SUM(l."quantity") FILTER (WHERE ${inPeriod}
             AND l."movement_type" IN ('OPENING', 'INWARD', 'TRANSFER_IN', 'RETURN_IN')), 0) AS "inward",
           COALESCE(-SUM(l."quantity") FILTER (WHERE ${inPeriod}
             AND l."movement_type" IN ('OUTWARD', 'TRANSFER_OUT', 'RETURN_OUT')), 0) AS "outward",
           COALESCE(SUM(l."quantity") FILTER (WHERE ${inPeriod}
             AND l."movement_type" IN ('ADJUSTMENT', 'REVERSAL')), 0) AS "adjustments",
           COALESCE(SUM(l."quantity"), 0) AS "closing"
    FROM "inventory_ledger" l
    JOIN "sku" s ON s."id" = l."sku_id"
    JOIN "uom" u ON u."id" = s."base_uom_id"
    JOIN "godown" g ON g."id" = l."godown_id"
    JOIN "batch" b ON b."id" = l."batch_id"
    WHERE l."created_at" < ${end}
      ${query.godownId ? Prisma.sql`AND l."godown_id" = ${query.godownId}::uuid` : Prisma.empty}
      ${query.skuId ? Prisma.sql`AND l."sku_id" = ${query.skuId}::uuid` : Prisma.empty}
    GROUP BY s."id", s."code", s."name", u."code", g."code", g."name"
             ${byBatch ? Prisma.sql`, b."batch_number"` : Prisma.empty}
    HAVING SUM(l."quantity") FILTER (WHERE l."created_at" < ${start}) <> 0
        OR COUNT(*) FILTER (WHERE ${inPeriod}) > 0
    ORDER BY s."code", g."code" ${byBatch ? Prisma.sql`, b."batch_number"` : Prisma.empty}
    LIMIT ${REPORT_ROW_LIMIT}`;
  return { range, rows };
}

/** Ledger entries within a period, oldest first (spec §6.7 movement report). */
export async function getMovementReport(query: MovementReportQuery) {
  const range = resolveRange(query);
  const entries = await prisma.inventoryLedger.findMany({
    where: {
      createdAt: { gte: istDayStart(range.from), lt: istDayStart(addDays(range.to, 1)) },
      godownId: query.godownId,
      skuId: query.skuId,
      movementType: query.movementType,
    },
    orderBy: { entryNo: "asc" },
    take: REPORT_ROW_LIMIT,
    select: ledgerEntrySelect,
  });
  return { range, entries };
}

export interface StockAgingRow {
  skuId: string;
  skuCode: string;
  skuName: string;
  unit: string;
  godownId: string;
  godownCode: string;
  godownName: string;
  quantity: Decimal;
  lastMovementAt: Date;
  daysIdle: number;
}

/**
 * Stock on hand per SKU × godown with no movement for at least the configured
 * number of days: slow or dead (Administration → Notifications; the
 * SLOW_STOCK_DAYS / DEAD_STOCK_DAYS environment values are the defaults).
 */
export async function getStockAging(query: StockAgingQuery): Promise<{ minDays: number; rows: StockAgingRow[] }> {
  const settings = await getStockAgingSettings();
  const minDays = query.kind === "dead" ? settings.deadStockDays : settings.slowStockDays;
  return { minDays, rows: await listIdleStock(minDays, { godownId: query.godownId }) };
}

/**
 * SKU × godown pairs with stock on hand whose last ledger movement is at least
 * `minDays` old, oldest first. Also drives the daily slow-moving alert scan.
 */
export function listIdleStock(
  minDays: number,
  options: { godownId?: string; limit?: number; db?: Tx } = {},
): Promise<StockAgingRow[]> {
  const db = options.db ?? prisma;
  return db.$queryRaw<StockAgingRow[]>`
    WITH stock AS (
      SELECT "sku_id", "godown_id", SUM("quantity") AS "quantity"
      FROM "stock_balance"
      ${options.godownId ? Prisma.sql`WHERE "godown_id" = ${options.godownId}::uuid` : Prisma.empty}
      GROUP BY 1, 2
      HAVING SUM("quantity") > 0
    ), last_movement AS (
      SELECT "sku_id", "godown_id", MAX("created_at") AS "at"
      FROM "inventory_ledger"
      GROUP BY 1, 2
    )
    SELECT s."id" AS "skuId", s."code" AS "skuCode", s."name" AS "skuName", u."code" AS "unit",
           g."id" AS "godownId", g."code" AS "godownCode", g."name" AS "godownName",
           st."quantity", lm."at" AS "lastMovementAt",
           FLOOR(EXTRACT(EPOCH FROM (now() - lm."at")) / 86400)::int AS "daysIdle"
    FROM stock st
    JOIN last_movement lm USING ("sku_id", "godown_id")
    JOIN "sku" s ON s."id" = st."sku_id"
    JOIN "uom" u ON u."id" = s."base_uom_id"
    JOIN "godown" g ON g."id" = st."godown_id"
    WHERE lm."at" <= now() - make_interval(days => ${minDays}::int)
    ORDER BY lm."at", s."code", g."code"
    LIMIT ${options.limit ?? REPORT_ROW_LIMIT}`;
}
