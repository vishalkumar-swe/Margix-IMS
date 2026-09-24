import { Prisma } from "@prisma/client";
import {
  fillSeries,
  granularityFor,
  percentChange,
  previousPeriod,
  type Granularity,
  type Period,
  type TrendPoint,
} from "@/lib/analytics";
import { addDays, istDayStart, todayIst } from "@/lib/dates";
import { prisma } from "@/server/db/client";
import { Decimal, ZERO } from "@/server/db/decimal";
import { getStockAgingSettings } from "@/server/modules/settings/stock-aging";

/**
 * Analytics read models (inventory, sales, purchasing, operations). Every
 * figure is one SQL aggregate — no per-document loops — and every date is an
 * IST calendar day. Rows come back as plain strings/numbers (money rounded to
 * 2 decimals), ready for server pages, client charts and CSV alike.
 */

export interface AnalyticsFilters {
  period: Period;
  categoryId?: string;
  skuId?: string;
  customerId?: string;
  supplierId?: string;
}

/** Rows shown per top-N list on screen; CSV exports pass a larger limit. */
export const TOP_N = 10;

// ---------------------------------------------------------------------------
// Value definitions — the ONLY place analytics computes money.
//
// Table aliases these fragments rely on: ii = invoice_item, pi =
// purchase_order_item, gi = grn_item, c = latest-cost CTE. Rates are per
// ENTERED unit (the alternate unit when one was used), quantities on the lines
// are in the base unit, and entry_factor converts between them. Values exclude
// GST. When line discounts / document-level charges are introduced, change
// these fragments (and only these) to post-discount values.
// ---------------------------------------------------------------------------

/** Sales value of an invoice line: entered quantity × rate. */
export const invoiceLineValueSql = Prisma.sql`(COALESCE(ii."entry_quantity", ii."quantity") * COALESCE(ii."rate", 0))`;

/** GST charged on an invoice line: sales value × GST rate / 100. */
export const invoiceLineGstSql = Prisma.sql`(${invoiceLineValueSql} * COALESCE(ii."gst_rate", 0) / 100)`;

/** Value of the part of an invoice line not yet dispatched. */
export const invoiceLinePendingValueSql = Prisma.sql`(GREATEST(ii."quantity" - ii."dispatched_qty", 0) / COALESCE(ii."entry_factor", 1) * COALESCE(ii."rate", 0))`;

/** Purchase value of a PO line: ordered (entered) quantity × rate. */
export const poLineValueSql = Prisma.sql`(COALESCE(pi."entry_quantity", pi."ordered_qty") * COALESCE(pi."rate", 0))`;

/** Value of the part of a PO line still to be received. */
export const poLinePendingValueSql = Prisma.sql`(GREATEST(pi."ordered_qty" - pi."received_qty", 0) / COALESCE(pi."entry_factor", 1) * COALESCE(pi."rate", 0))`;

/** Received value of a GRN line: accepted base quantity at the PO line's rate. */
export const grnLineValueSql = Prisma.sql`(gi."accepted_qty" / COALESCE(pi."entry_factor", 1) * COALESCE(pi."rate", 0))`;

/** Cost of one BASE unit on a PO line. */
export const poLineUnitCostSql = Prisma.sql`(pi."rate" / COALESCE(pi."entry_factor", 1))`;

/**
 * Latest purchase cost per base unit of each SKU: the rate on its most recent
 * (by order date) non-draft, non-cancelled PO line that has a rate. Exposed
 * as CTE `cost(sku_id, unit_cost)`; SKUs without one are "no cost".
 */
const latestCostCte = Prisma.sql`cost AS (
  SELECT DISTINCT ON (pi."sku_id") pi."sku_id", ${poLineUnitCostSql} AS "unit_cost"
  FROM "purchase_order_item" pi
  JOIN "purchase_order" po ON po."id" = pi."purchase_order_id"
  WHERE pi."rate" IS NOT NULL AND po."status" NOT IN ('DRAFT', 'CANCELLED')
  ORDER BY pi."sku_id", po."order_date" DESC, po."created_at" DESC, pi."line_no"
)`;

/** Stock value of a base quantity at the latest cost (0 when the SKU has no cost). */
const stockValueSql = (quantity: Prisma.Sql) => Prisma.sql`(${quantity} * COALESCE(c."unit_cost", 0))`;

/** A quantity as exact text without trailing zeros ("307.000" → "307"), like Decimal#toString. */
const qty = (expression: Prisma.Sql) => Prisma.sql`trim_scale(${expression})::text`;

/** SUM of a money expression, rounded to paise, as text. */
const money = (expression: Prisma.Sql) => Prisma.sql`ROUND(COALESCE(SUM(${expression}), 0), 2)::text`;

// ---------------------------------------------------------------------------
// Date and filter fragments
// ---------------------------------------------------------------------------

/** IST calendar day of a timestamptz column. */
const istDate = (column: Prisma.Sql) => Prisma.sql`((${column}) AT TIME ZONE 'Asia/Kolkata')::date`;

/** Bucket key (YYYY-MM-DD of the day, the week's Monday or the month's 1st) of a DATE expression. */
function bucketSql(date: Prisma.Sql, granularity: Granularity): Prisma.Sql {
  if (granularity === "day") return Prisma.sql`to_char(${date}, 'YYYY-MM-DD')`;
  const unit = granularity === "week" ? Prisma.sql`'week'` : Prisma.sql`'month'`;
  return Prisma.sql`to_char(date_trunc(${unit}, (${date})::timestamp), 'YYYY-MM-DD')`;
}

/** A DATE column within an inclusive period. */
const dateWithin = (column: Prisma.Sql, period: Period) =>
  Prisma.sql`${column} BETWEEN ${period.from}::date AND ${period.to}::date`;

/** A timestamptz column within the IST days of an inclusive period. */
const instantWithin = (column: Prisma.Sql, period: Period) =>
  Prisma.sql`${column} >= ${istDayStart(period.from)} AND ${column} < ${istDayStart(addDays(period.to, 1))}`;

/** Product and category filters on the joined `sku s`. */
function productFilter(f: AnalyticsFilters): Prisma.Sql {
  return Prisma.sql`${f.skuId ? Prisma.sql`AND s."id" = ${f.skuId}::uuid` : Prisma.empty}
    ${f.categoryId ? Prisma.sql`AND s."category_id" = ${f.categoryId}::uuid` : Prisma.empty}`;
}

const customerFilter = (f: AnalyticsFilters, column: Prisma.Sql) =>
  f.customerId ? Prisma.sql`AND ${column} = ${f.customerId}::uuid` : Prisma.empty;

const supplierFilter = (f: AnalyticsFilters, column: Prisma.Sql) =>
  f.supplierId ? Prisma.sql`AND ${column} = ${f.supplierId}::uuid` : Prisma.empty;

/** Invoice lines counted as sales: every invoice except cancelled ones, by invoice date. */
function salesLines(f: AnalyticsFilters, period: Period): Prisma.Sql {
  return Prisma.sql`FROM "invoice_item" ii
    JOIN "invoice" i ON i."id" = ii."invoice_id"
    JOIN "customer" cu ON cu."id" = i."customer_id"
    JOIN "sku" s ON s."id" = ii."sku_id"
    JOIN "uom" u ON u."id" = s."base_uom_id"
    LEFT JOIN "category" cat ON cat."id" = s."category_id"
    WHERE i."status" <> 'CANCELLED' AND ${dateWithin(Prisma.sql`i."invoice_date"`, period)}
      ${customerFilter(f, Prisma.sql`i."customer_id"`)} ${productFilter(f)}`;
}

/** PO lines counted as purchases: submitted (non-draft), non-cancelled orders, by order date. */
function purchaseLines(f: AnalyticsFilters, period: Period): Prisma.Sql {
  return Prisma.sql`FROM "purchase_order_item" pi
    JOIN "purchase_order" po ON po."id" = pi."purchase_order_id"
    JOIN "sku" s ON s."id" = pi."sku_id"
    WHERE po."status" NOT IN ('DRAFT', 'CANCELLED') AND ${dateWithin(Prisma.sql`po."order_date"`, period)}
      ${supplierFilter(f, Prisma.sql`po."supplier_id"`)} ${productFilter(f)}`;
}

/** GRN lines received in the period whose stock entry has not been reversed. */
function receiptLines(f: AnalyticsFilters, period: Period): Prisma.Sql {
  return Prisma.sql`FROM "grn_item" gi
    JOIN "grn" g ON g."id" = gi."grn_id"
    JOIN "purchase_order_item" pi ON pi."id" = gi."purchase_order_item_id"
    JOIN "purchase_order" po ON po."id" = g."purchase_order_id"
    JOIN "sku" s ON s."id" = gi."sku_id"
    WHERE ${instantWithin(Prisma.sql`g."received_at"`, period)}
      AND NOT EXISTS (SELECT 1 FROM "inventory_ledger" r WHERE r."reverses_entry_id" = gi."ledger_entry_id")
      ${supplierFilter(f, Prisma.sql`po."supplier_id"`)} ${productFilter(f)}`;
}

/** PO lines of orders still awaiting goods (open or partially received), whatever their date. */
function pendingPurchaseLines(f: AnalyticsFilters): Prisma.Sql {
  return Prisma.sql`FROM "purchase_order_item" pi
    JOIN "purchase_order" po ON po."id" = pi."purchase_order_id"
    JOIN "supplier" sup ON sup."id" = po."supplier_id"
    JOIN "sku" s ON s."id" = pi."sku_id"
    WHERE po."status" IN ('OPEN', 'PARTIALLY_RECEIVED')
      ${supplierFilter(f, Prisma.sql`po."supplier_id"`)} ${productFilter(f)}`;
}

// ---------------------------------------------------------------------------
// KPIs
// ---------------------------------------------------------------------------

/** A headline figure with its value in the previous equal period and a sparkline. */
export interface Kpi {
  current: string;
  previous: string | null;
  /** % change vs previous; null when there is nothing to compare with. */
  change: number | null;
  spark: string[];
}

function kpi(current: string, previous: string | null, spark: string[] = []): Kpi {
  return { current, previous, change: previous === null ? null : percentChange(current, previous), spark };
}

// ---------------------------------------------------------------------------
// Sales
// ---------------------------------------------------------------------------

export interface SalesTotals {
  value: string;
  gst: string;
  invoices: number;
  customers: number;
  /** Base-unit quantity invoiced (mixed units when several SKUs are included). */
  quantity: string;
  averageInvoice: string;
}

export async function getSalesTotals(f: AnalyticsFilters, period = f.period): Promise<SalesTotals> {
  const [row] = await prisma.$queryRaw<SalesTotals[]>`
    SELECT ${money(invoiceLineValueSql)} AS "value", ${money(invoiceLineGstSql)} AS "gst",
           COUNT(DISTINCT i."id")::int AS "invoices", COUNT(DISTINCT i."customer_id")::int AS "customers",
           ${qty(Prisma.sql`COALESCE(SUM(ii."quantity"), 0)`)} AS "quantity",
           ROUND(COALESCE(SUM(${invoiceLineValueSql}) / NULLIF(COUNT(DISTINCT i."id"), 0), 0), 2)::text AS "averageInvoice"
    ${salesLines(f, period)}`;
  return row;
}

/** Sales value and GST per bucket over the filter period. */
export async function getSalesTrend(f: AnalyticsFilters, granularity = granularityFor(f.period)): Promise<TrendPoint[]> {
  const rows = await prisma.$queryRaw<{ bucket: string; sales: string; gst: string }[]>`
    SELECT ${bucketSql(Prisma.sql`i."invoice_date"`, granularity)} AS "bucket",
           ${money(invoiceLineValueSql)} AS "sales", ${money(invoiceLineGstSql)} AS "gst"
    ${salesLines(f, f.period)}
    GROUP BY 1`;
  return fillSeries(f.period, granularity, rows, ["sales", "gst"]);
}

export interface SalesByProductRow {
  skuId: string;
  skuCode: string;
  skuName: string;
  unit: string;
  category: string | null;
  quantity: string;
  value: string;
  gst: string;
}

export function getSalesByProduct(f: AnalyticsFilters, limit = TOP_N): Promise<SalesByProductRow[]> {
  return prisma.$queryRaw<SalesByProductRow[]>`
    SELECT s."id" AS "skuId", s."code" AS "skuCode", s."name" AS "skuName", u."code" AS "unit",
           cat."name" AS "category", ${qty(Prisma.sql`SUM(ii."quantity")`)} AS "quantity",
           ${money(invoiceLineValueSql)} AS "value", ${money(invoiceLineGstSql)} AS "gst"
    ${salesLines(f, f.period)}
    GROUP BY s."id", s."code", s."name", u."code", cat."name"
    ORDER BY SUM(${invoiceLineValueSql}) DESC, s."code"
    LIMIT ${limit}`;
}

export interface SalesByCustomerRow {
  customerId: string;
  customerCode: string;
  customerName: string;
  invoices: number;
  value: string;
  gst: string;
}

export function getSalesByCustomer(f: AnalyticsFilters, limit = TOP_N): Promise<SalesByCustomerRow[]> {
  return prisma.$queryRaw<SalesByCustomerRow[]>`
    SELECT cu."id" AS "customerId", cu."code" AS "customerCode", cu."name" AS "customerName",
           COUNT(DISTINCT i."id")::int AS "invoices",
           ${money(invoiceLineValueSql)} AS "value", ${money(invoiceLineGstSql)} AS "gst"
    ${salesLines(f, f.period)}
    GROUP BY cu."id", cu."code", cu."name"
    ORDER BY SUM(${invoiceLineValueSql}) DESC, cu."code"
    LIMIT ${limit}`;
}


export interface CategoryValueRow {
  categoryId: string | null;
  category: string;
  value: string;
}

export function getSalesByCategory(f: AnalyticsFilters): Promise<CategoryValueRow[]> {
  return prisma.$queryRaw<CategoryValueRow[]>`
    SELECT cat."id" AS "categoryId", COALESCE(cat."name", 'Uncategorised') AS "category",
           ${money(invoiceLineValueSql)} AS "value"
    ${salesLines(f, f.period)}
    GROUP BY cat."id", cat."name"
    ORDER BY SUM(${invoiceLineValueSql}) DESC, 2`;
}

// ---------------------------------------------------------------------------
// Purchasing
// ---------------------------------------------------------------------------

export interface PurchaseTotals {
  value: string;
  orders: number;
  suppliers: number;
}

export async function getPurchaseTotals(f: AnalyticsFilters, period = f.period): Promise<PurchaseTotals> {
  const [row] = await prisma.$queryRaw<PurchaseTotals[]>`
    SELECT ${money(poLineValueSql)} AS "value", COUNT(DISTINCT po."id")::int AS "orders",
           COUNT(DISTINCT po."supplier_id")::int AS "suppliers"
    ${purchaseLines(f, period)}`;
  return row;
}

export interface ReceiptTotals {
  value: string;
  grns: number;
  receivedQty: string;
  rejectedQty: string;
  /** Rejected ÷ received quantity, in %, rounded to 0.1; null when nothing was received. */
  rejectionRate: string | null;
}

export async function getReceiptTotals(f: AnalyticsFilters, period = f.period): Promise<ReceiptTotals> {
  const [row] = await prisma.$queryRaw<ReceiptTotals[]>`
    SELECT ${money(grnLineValueSql)} AS "value", COUNT(DISTINCT g."id")::int AS "grns",
           ${qty(Prisma.sql`COALESCE(SUM(gi."received_qty"), 0)`)} AS "receivedQty",
           ${qty(Prisma.sql`COALESCE(SUM(gi."rejected_qty"), 0)`)} AS "rejectedQty",
           ROUND(SUM(gi."rejected_qty") * 100 / NULLIF(SUM(gi."received_qty"), 0), 1)::text AS "rejectionRate"
    ${receiptLines(f, period)}`;
  return row;
}

/** Ordered value (by PO date) and received value (by GRN date) per bucket. */
export async function getPurchaseTrend(f: AnalyticsFilters, granularity = granularityFor(f.period)): Promise<TrendPoint[]> {
  const [ordered, received] = await Promise.all([
    prisma.$queryRaw<{ bucket: string; ordered: string }[]>`
      SELECT ${bucketSql(Prisma.sql`po."order_date"`, granularity)} AS "bucket", ${money(poLineValueSql)} AS "ordered"
      ${purchaseLines(f, f.period)}
      GROUP BY 1`,
    prisma.$queryRaw<{ bucket: string; received: string }[]>`
      SELECT ${bucketSql(istDate(Prisma.sql`g."received_at"`), granularity)} AS "bucket",
             ${money(grnLineValueSql)} AS "received"
      ${receiptLines(f, f.period)}
      GROUP BY 1`,
  ]);
  return mergeSeries(f.period, granularity, { ordered, received });
}

/** Sales vs purchases (ordered value) per bucket — the comparison chart. */
export async function getSalesVsPurchasesTrend(
  f: AnalyticsFilters,
  granularity = granularityFor(f.period),
): Promise<TrendPoint[]> {
  const [sales, purchases] = await Promise.all([
    prisma.$queryRaw<{ bucket: string; sales: string }[]>`
      SELECT ${bucketSql(Prisma.sql`i."invoice_date"`, granularity)} AS "bucket", ${money(invoiceLineValueSql)} AS "sales"
      ${salesLines(f, f.period)}
      GROUP BY 1`,
    prisma.$queryRaw<{ bucket: string; purchases: string }[]>`
      SELECT ${bucketSql(Prisma.sql`po."order_date"`, granularity)} AS "bucket", ${money(poLineValueSql)} AS "purchases"
      ${purchaseLines(f, f.period)}
      GROUP BY 1`,
  ]);
  return mergeSeries(f.period, granularity, { sales, purchases });
}

/** Combines single-series SQL results into one filled series. */
function mergeSeries(
  period: Period,
  granularity: Granularity,
  sources: Record<string, { bucket: string; [key: string]: string }[]>,
): TrendPoint[] {
  const merged = new Map<string, { bucket: string; [key: string]: string }>();
  for (const [name, rows] of Object.entries(sources)) {
    for (const row of rows) merged.set(row.bucket, { ...merged.get(row.bucket), bucket: row.bucket, [name]: row[name] });
  }
  return fillSeries(period, granularity, [...merged.values()], Object.keys(sources));
}

export interface SupplierPurchaseRow {
  supplierId: string;
  supplierCode: string;
  supplierName: string;
  orders: number;
  ordered: string;
  received: string;
  /** Still to be received on this supplier's open orders (any date). */
  pending: string;
}

/** Supplier-wise purchasing: ordered and received in the period, pending now. */
export function getPurchasesBySupplier(f: AnalyticsFilters, limit = TOP_N): Promise<SupplierPurchaseRow[]> {
  return prisma.$queryRaw<SupplierPurchaseRow[]>`
    WITH ordered AS (
      SELECT po."supplier_id", COUNT(DISTINCT po."id") AS "orders", SUM(${poLineValueSql}) AS "value"
      ${purchaseLines(f, f.period)}
      GROUP BY 1
    ), received AS (
      SELECT po."supplier_id", SUM(${grnLineValueSql}) AS "value"
      ${receiptLines(f, f.period)}
      GROUP BY 1
    ), pending AS (
      SELECT po."supplier_id", SUM(${poLinePendingValueSql}) AS "value"
      ${pendingPurchaseLines(f)}
      GROUP BY 1
    )
    SELECT sup."id" AS "supplierId", sup."code" AS "supplierCode", sup."name" AS "supplierName",
           COALESCE(o."orders", 0)::int AS "orders",
           ROUND(COALESCE(o."value", 0), 2)::text AS "ordered",
           ROUND(COALESCE(r."value", 0), 2)::text AS "received",
           ROUND(COALESCE(p."value", 0), 2)::text AS "pending"
    FROM "supplier" sup
    LEFT JOIN ordered o ON o."supplier_id" = sup."id"
    LEFT JOIN received r ON r."supplier_id" = sup."id"
    LEFT JOIN pending p ON p."supplier_id" = sup."id"
    WHERE o."supplier_id" IS NOT NULL OR r."supplier_id" IS NOT NULL OR p."supplier_id" IS NOT NULL
    ORDER BY COALESCE(o."value", 0) DESC, COALESCE(p."value", 0) DESC, sup."code"
    LIMIT ${limit}`;
}

export interface PendingPurchaseOrderRow {
  id: string;
  poNumber: string;
  supplierName: string;
  status: string;
  orderDate: string;
  expectedDate: string | null;
  overdue: boolean;
  ordered: string;
  pending: string;
}

export interface PendingPurchaseOrders {
  count: number;
  overdue: number;
  value: string;
  rows: PendingPurchaseOrderRow[];
}

/** Orders awaiting goods now (not period-bound), most urgent first. */
export async function getPendingPurchaseOrders(f: AnalyticsFilters, limit = TOP_N): Promise<PendingPurchaseOrders> {
  const today = todayIst();
  const [totals, rows] = await Promise.all([
    prisma.$queryRaw<{ count: number; overdue: number; value: string }[]>`
      SELECT COUNT(DISTINCT po."id")::int AS "count",
             COUNT(DISTINCT po."id") FILTER (WHERE po."expected_date" < ${today}::date)::int AS "overdue",
             ${money(poLinePendingValueSql)} AS "value"
      ${pendingPurchaseLines(f)}`,
    prisma.$queryRaw<PendingPurchaseOrderRow[]>`
      SELECT po."id", po."po_number" AS "poNumber", sup."name" AS "supplierName", po."status"::text AS "status",
             to_char(po."order_date", 'YYYY-MM-DD') AS "orderDate",
             to_char(po."expected_date", 'YYYY-MM-DD') AS "expectedDate",
             COALESCE(po."expected_date" < ${today}::date, false) AS "overdue",
             ${money(poLineValueSql)} AS "ordered", ${money(poLinePendingValueSql)} AS "pending"
      ${pendingPurchaseLines(f)}
      GROUP BY po."id", po."po_number", sup."name", po."status", po."order_date", po."expected_date"
      ORDER BY po."expected_date" NULLS LAST, po."order_date", po."po_number"
      LIMIT ${limit}`,
  ]);
  return { ...totals[0], rows };
}

// ---------------------------------------------------------------------------
// Inventory
// ---------------------------------------------------------------------------

export interface InventoryTotals {
  /** On-hand value at latest purchase cost. */
  value: string;
  /** On-hand base quantity (mixed units when several SKUs are included). */
  quantity: string;
  skusInStock: number;
  /** SKUs in stock without any purchase rate — not included in `value`. */
  noCostSkus: number;
  noCostQuantity: string;
}

export async function getInventoryTotals(f: AnalyticsFilters): Promise<InventoryTotals> {
  const [row] = await prisma.$queryRaw<InventoryTotals[]>`
    WITH ${latestCostCte}, stock AS (
      SELECT "sku_id", SUM("quantity") AS "quantity" FROM "stock_balance" GROUP BY 1 HAVING SUM("quantity") > 0
    )
    SELECT ${money(stockValueSql(Prisma.sql`st."quantity"`))} AS "value",
           ${qty(Prisma.sql`COALESCE(SUM(st."quantity"), 0)`)} AS "quantity",
           COUNT(*)::int AS "skusInStock",
           COUNT(*) FILTER (WHERE c."sku_id" IS NULL)::int AS "noCostSkus",
           ${qty(Prisma.sql`COALESCE(SUM(st."quantity") FILTER (WHERE c."sku_id" IS NULL), 0)`)} AS "noCostQuantity"
    FROM stock st
    JOIN "sku" s ON s."id" = st."sku_id"
    LEFT JOIN cost c ON c."sku_id" = st."sku_id"
    WHERE true ${productFilter(f)}`;
  return row;
}

export interface ValuationRow {
  skuId: string;
  skuCode: string;
  skuName: string;
  unit: string;
  category: string | null;
  quantity: string;
  /** Latest cost per base unit (4 decimals); null = no cost. */
  unitCost: string | null;
  value: string;
  noCost: boolean;
}

export function getInventoryValuation(f: AnalyticsFilters, limit = TOP_N): Promise<ValuationRow[]> {
  return prisma.$queryRaw<ValuationRow[]>`
    WITH ${latestCostCte}, stock AS (
      SELECT "sku_id", SUM("quantity") AS "quantity" FROM "stock_balance" GROUP BY 1 HAVING SUM("quantity") > 0
    )
    SELECT s."id" AS "skuId", s."code" AS "skuCode", s."name" AS "skuName", u."code" AS "unit",
           cat."name" AS "category", ${qty(Prisma.sql`st."quantity"`)} AS "quantity",
           ROUND(c."unit_cost", 4)::text AS "unitCost",
           ROUND(${stockValueSql(Prisma.sql`st."quantity"`)}, 2)::text AS "value",
           (c."sku_id" IS NULL) AS "noCost"
    FROM stock st
    JOIN "sku" s ON s."id" = st."sku_id"
    JOIN "uom" u ON u."id" = s."base_uom_id"
    LEFT JOIN "category" cat ON cat."id" = s."category_id"
    LEFT JOIN cost c ON c."sku_id" = st."sku_id"
    WHERE true ${productFilter(f)}
    ORDER BY ${stockValueSql(Prisma.sql`st."quantity"`)} DESC, s."code"
    LIMIT ${limit}`;
}

/** On-hand value by category (the category-mix donut). */
export function getInventoryByCategory(f: AnalyticsFilters): Promise<CategoryValueRow[]> {
  return prisma.$queryRaw<CategoryValueRow[]>`
    WITH ${latestCostCte}, stock AS (
      SELECT "sku_id", SUM("quantity") AS "quantity" FROM "stock_balance" GROUP BY 1 HAVING SUM("quantity") > 0
    )
    SELECT cat."id" AS "categoryId", COALESCE(cat."name", 'Uncategorised') AS "category",
           ${money(stockValueSql(Prisma.sql`st."quantity"`))} AS "value"
    FROM stock st
    JOIN "sku" s ON s."id" = st."sku_id"
    LEFT JOIN "category" cat ON cat."id" = s."category_id"
    LEFT JOIN cost c ON c."sku_id" = st."sku_id"
    WHERE true ${productFilter(f)}
    GROUP BY cat."id", cat."name"
    ORDER BY SUM(${stockValueSql(Prisma.sql`st."quantity"`)}) DESC, 2`;
}

export interface StockMovementTrend {
  /** Stock value (at current costs) at the start of the period and the end of each bucket. */
  openingValue: string;
  closingValue: string;
  /** Per bucket: inward/outward/adjustment value and closing stock value. */
  points: TrendPoint[];
}

/**
 * Stock movements per bucket, valued at the latest cost. Inward = opening,
 * receipts and customer returns; outward = dispatches and supplier returns;
 * adjustments include reversals. Transfers between godowns do not change
 * company stock and are left out. Closing value is reconstructed backwards
 * from today's stock, so it is exact for quantities and uses today's costs.
 */
export async function getStockMovementTrend(
  f: AnalyticsFilters,
  granularity = granularityFor(f.period),
): Promise<StockMovementTrend> {
  const start = istDayStart(f.period.from);
  const [rows, [since], totals] = await Promise.all([
    prisma.$queryRaw<{ bucket: string; inward: string; outward: string; adjustments: string; net: string; inwardQty: string; outwardQty: string }[]>`
      WITH ${latestCostCte}
      SELECT ${bucketSql(istDate(Prisma.sql`l."created_at"`), granularity)} AS "bucket",
             ROUND(COALESCE(SUM(${stockValueSql(Prisma.sql`l."quantity"`)}) FILTER (WHERE l."movement_type" IN ('OPENING', 'INWARD', 'RETURN_IN')), 0), 2)::text AS "inward",
             ROUND(COALESCE(-SUM(${stockValueSql(Prisma.sql`l."quantity"`)}) FILTER (WHERE l."movement_type" IN ('OUTWARD', 'RETURN_OUT')), 0), 2)::text AS "outward",
             ROUND(COALESCE(SUM(${stockValueSql(Prisma.sql`l."quantity"`)}) FILTER (WHERE l."movement_type" IN ('ADJUSTMENT', 'REVERSAL')), 0), 2)::text AS "adjustments",
             ROUND(COALESCE(SUM(${stockValueSql(Prisma.sql`l."quantity"`)}), 0), 2)::text AS "net",
             ${qty(Prisma.sql`COALESCE(SUM(l."quantity") FILTER (WHERE l."movement_type" IN ('OPENING', 'INWARD', 'RETURN_IN')), 0)`)} AS "inwardQty",
             ${qty(Prisma.sql`COALESCE(-SUM(l."quantity") FILTER (WHERE l."movement_type" IN ('OUTWARD', 'RETURN_OUT')), 0)`)} AS "outwardQty"
      FROM "inventory_ledger" l
      JOIN "sku" s ON s."id" = l."sku_id"
      LEFT JOIN cost c ON c."sku_id" = l."sku_id"
      WHERE ${instantWithin(Prisma.sql`l."created_at"`, f.period)} ${productFilter(f)}
      GROUP BY 1`,
    prisma.$queryRaw<{ change: string }[]>`
      WITH ${latestCostCte}
      SELECT ROUND(COALESCE(SUM(${stockValueSql(Prisma.sql`l."quantity"`)}), 0), 2)::text AS "change"
      FROM "inventory_ledger" l
      JOIN "sku" s ON s."id" = l."sku_id"
      LEFT JOIN cost c ON c."sku_id" = l."sku_id"
      WHERE l."created_at" >= ${start} ${productFilter(f)}`,
    getInventoryTotals(f),
  ]);

  const byBucket = new Map(rows.map((r) => [r.bucket, r]));
  let running = new Decimal(totals.value).minus(since.change);
  const openingValue = running.toFixed(2);
  const points = fillSeries(f.period, granularity, [], []).map((point) => {
    const row = byBucket.get(point.bucket);
    running = running.plus(row?.net ?? ZERO);
    return {
      ...point,
      values: {
        inward: row?.inward ?? "0",
        outward: row?.outward ?? "0",
        adjustments: row?.adjustments ?? "0",
        inwardQty: row?.inwardQty ?? "0",
        outwardQty: row?.outwardQty ?? "0",
        stockValue: running.toFixed(2),
      },
    };
  });
  return { openingValue, closingValue: running.toFixed(2), points };
}

export interface FastMovingRow {
  skuId: string;
  skuCode: string;
  skuName: string;
  unit: string;
  quantity: string;
  value: string;
  dispatches: number;
}

/** Top SKUs by dispatched (outward) quantity in the period, net of reversed dispatch lines. */
export function getFastMoving(f: AnalyticsFilters, limit = TOP_N): Promise<FastMovingRow[]> {
  return prisma.$queryRaw<FastMovingRow[]>`
    WITH ${latestCostCte}
    SELECT s."id" AS "skuId", s."code" AS "skuCode", s."name" AS "skuName", u."code" AS "unit",
           ${qty(Prisma.sql`-SUM(l."quantity")`)} AS "quantity",
           ROUND(-SUM(${stockValueSql(Prisma.sql`l."quantity"`)}), 2)::text AS "value",
           COUNT(DISTINCT l."reference_id")::int AS "dispatches"
    FROM "inventory_ledger" l
    JOIN "sku" s ON s."id" = l."sku_id"
    JOIN "uom" u ON u."id" = s."base_uom_id"
    LEFT JOIN cost c ON c."sku_id" = l."sku_id"
    WHERE l."movement_type" = 'OUTWARD' AND ${instantWithin(Prisma.sql`l."created_at"`, f.period)}
      AND NOT EXISTS (SELECT 1 FROM "inventory_ledger" r WHERE r."reverses_entry_id" = l."id")
      ${productFilter(f)}
    GROUP BY s."id", s."code", s."name", u."code"
    ORDER BY SUM(l."quantity"), s."code"
    LIMIT ${limit}`;
}

/**
 * Stock on hand per SKU × godown with days since its last movement (any
 * type), as CTE `aged`. Same basis as the slow/dead stock reports.
 */
function agedStockCte(f: AnalyticsFilters): Prisma.Sql {
  return Prisma.sql`${latestCostCte}, stock AS (
      SELECT "sku_id", "godown_id", SUM("quantity") AS "quantity"
      FROM "stock_balance" GROUP BY 1, 2 HAVING SUM("quantity") > 0
    ), aged AS (
      SELECT st."sku_id", st."godown_id", st."quantity", lm."at" AS "last_movement_at",
             FLOOR(EXTRACT(EPOCH FROM (now() - lm."at")) / 86400)::int AS "days_idle",
             ${stockValueSql(Prisma.sql`st."quantity"`)} AS "value"
      FROM stock st
      JOIN "sku" s ON s."id" = st."sku_id"
      LEFT JOIN cost c ON c."sku_id" = st."sku_id"
      CROSS JOIN LATERAL (
        SELECT MAX(l."created_at") AS "at" FROM "inventory_ledger" l
        WHERE l."sku_id" = st."sku_id" AND l."godown_id" = st."godown_id"
      ) lm
      WHERE true ${productFilter(f)}
    )`;
}

/** Stock ageing bands (days since last movement). Upper bounds are inclusive; the last band is open. */
export const AGEING_BANDS = [
  { label: "0–30 days", max: 30 },
  { label: "31–60 days", max: 60 },
  { label: "61–90 days", max: 90 },
  { label: "91–180 days", max: 180 },
  { label: "Over 180 days", max: null },
] as const;

export interface AgeingBandRow {
  band: string;
  lines: number;
  quantity: string;
  value: string;
}

export async function getStockAgeing(f: AnalyticsFilters): Promise<AgeingBandRow[]> {
  const rows = await prisma.$queryRaw<(AgeingBandRow & { idx: number })[]>`
    WITH ${agedStockCte(f)}
    SELECT CASE WHEN "days_idle" <= 30 THEN 0 WHEN "days_idle" <= 60 THEN 1 WHEN "days_idle" <= 90 THEN 2
                WHEN "days_idle" <= 180 THEN 3 ELSE 4 END AS "idx",
           COUNT(*)::int AS "lines", ${qty(Prisma.sql`SUM("quantity")`)} AS "quantity", ROUND(SUM("value"), 2)::text AS "value"
    FROM aged GROUP BY 1`;
  const byIndex = new Map(rows.map((r) => [Number(r.idx), r]));
  return AGEING_BANDS.map((band, index) => {
    const row = byIndex.get(index);
    return { band: band.label, lines: row?.lines ?? 0, quantity: row?.quantity ?? "0", value: row?.value ?? "0.00" };
  });
}

export interface IdleStockSummary {
  lines: number;
  skus: number;
  value: string;
}

export interface IdleStockRow {
  skuId: string;
  skuCode: string;
  skuName: string;
  unit: string;
  godownCode: string;
  quantity: string;
  value: string;
  lastMovementAt: string;
  daysIdle: number;
}

/**
 * Slow-moving: idle for at least SLOW_STOCK_DAYS but less than DEAD_STOCK_DAYS.
 * Dead: idle for DEAD_STOCK_DAYS or more. (The two are exclusive here.)
 */
export async function getIdleStock(f: AnalyticsFilters, kind: "slow" | "dead", limit = TOP_N) {
  const { slowStockDays, deadStockDays } = await getStockAgingSettings();
  const band =
    kind === "dead"
      ? Prisma.sql`"days_idle" >= ${deadStockDays}::int`
      : Prisma.sql`"days_idle" >= ${slowStockDays}::int AND "days_idle" < ${deadStockDays}::int`;
  const [[summary], rows] = await Promise.all([
    prisma.$queryRaw<IdleStockSummary[]>`
      WITH ${agedStockCte(f)}
      SELECT COUNT(*)::int AS "lines", COUNT(DISTINCT "sku_id")::int AS "skus",
             ROUND(COALESCE(SUM("value"), 0), 2)::text AS "value"
      FROM aged WHERE ${band}`,
    prisma.$queryRaw<IdleStockRow[]>`
      WITH ${agedStockCte(f)}
      SELECT s."id" AS "skuId", s."code" AS "skuCode", s."name" AS "skuName", u."code" AS "unit",
             g."code" AS "godownCode", ${qty(Prisma.sql`a."quantity"`)} AS "quantity", ROUND(a."value", 2)::text AS "value",
             to_char(a."last_movement_at" AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD') AS "lastMovementAt",
             a."days_idle" AS "daysIdle"
      FROM aged a
      JOIN "sku" s ON s."id" = a."sku_id"
      JOIN "uom" u ON u."id" = s."base_uom_id"
      JOIN "godown" g ON g."id" = a."godown_id"
      WHERE ${band}
      ORDER BY a."value" DESC, a."days_idle" DESC, s."code", g."code"
      LIMIT ${limit}`,
  ]);
  return { minDays: kind === "dead" ? deadStockDays : slowStockDays, maxDays: kind === "slow" ? deadStockDays : null, ...summary, rows };
}

export interface LowStockRow {
  skuId: string;
  skuCode: string;
  skuName: string;
  unit: string;
  godownCode: string;
  currentQty: string;
  reorderLevel: string;
}

/** Active low-stock alerts (SKU × godown below its reorder level). */
export async function getLowStock(f: AnalyticsFilters, limit = TOP_N) {
  const [[summary], rows] = await Promise.all([
    prisma.$queryRaw<{ skus: number; lines: number }[]>`
      SELECT COUNT(DISTINCT a."sku_id")::int AS "skus", COUNT(*)::int AS "lines"
      FROM "stock_alert" a JOIN "sku" s ON s."id" = a."sku_id"
      WHERE a."status" = 'ACTIVE' ${productFilter(f)}`,
    prisma.$queryRaw<LowStockRow[]>`
      SELECT s."id" AS "skuId", s."code" AS "skuCode", s."name" AS "skuName", u."code" AS "unit",
             g."code" AS "godownCode", ${qty(Prisma.sql`a."current_qty"`)} AS "currentQty", ${qty(Prisma.sql`a."threshold_qty"`)} AS "reorderLevel"
      FROM "stock_alert" a
      JOIN "sku" s ON s."id" = a."sku_id"
      JOIN "uom" u ON u."id" = s."base_uom_id"
      JOIN "godown" g ON g."id" = a."godown_id"
      WHERE a."status" = 'ACTIVE' ${productFilter(f)}
      ORDER BY a."current_qty" / NULLIF(a."threshold_qty", 0) NULLS FIRST, s."code", g."code"
      LIMIT ${limit}`,
  ]);
  return { ...summary, rows };
}

export interface OutOfStockRow {
  skuId: string;
  skuCode: string;
  skuName: string;
  category: string | null;
  lastMovementAt: string | null;
}

/** Active SKUs with no stock in any godown. */
export async function getOutOfStock(f: AnalyticsFilters, limit = TOP_N) {
  const where = Prisma.sql`s."status" = 'ACTIVE'
    AND NOT EXISTS (SELECT 1 FROM "stock_balance" sb WHERE sb."sku_id" = s."id" AND sb."quantity" > 0)
    ${productFilter(f)}`;
  const [[summary], rows] = await Promise.all([
    prisma.$queryRaw<{ count: number }[]>`SELECT COUNT(*)::int AS "count" FROM "sku" s WHERE ${where}`,
    prisma.$queryRaw<OutOfStockRow[]>`
      SELECT s."id" AS "skuId", s."code" AS "skuCode", s."name" AS "skuName", cat."name" AS "category",
             to_char(lm."at" AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD') AS "lastMovementAt"
      FROM "sku" s
      LEFT JOIN "category" cat ON cat."id" = s."category_id"
      CROSS JOIN LATERAL (SELECT MAX(l."created_at") AS "at" FROM "inventory_ledger" l WHERE l."sku_id" = s."id") lm
      WHERE ${where}
      ORDER BY lm."at" DESC NULLS LAST, s."code"
      LIMIT ${limit}`,
  ]);
  return { count: summary.count, rows };
}

// ---------------------------------------------------------------------------
// Operations
// ---------------------------------------------------------------------------

export interface OperationalKpis {
  pendingPurchaseOrders: number;
  overduePurchaseOrders: number;
  pendingPurchaseValue: string;
  invoicesAwaitingDispatch: number;
  pendingDispatchValue: string;
  dispatches: number;
  grns: number;
  rejectionRate: string | null;
  customerReturns: number;
  pendingAdjustments: number;
}

export async function getOperationalKpis(f: AnalyticsFilters): Promise<OperationalKpis> {
  const [pos, [invoices], [counts], receipts] = await Promise.all([
    getPendingPurchaseOrders(f, 0),
    prisma.$queryRaw<{ count: number; value: string }[]>`
      SELECT COUNT(DISTINCT i."id")::int AS "count", ${money(invoiceLinePendingValueSql)} AS "value"
      FROM "invoice_item" ii
      JOIN "invoice" i ON i."id" = ii."invoice_id"
      JOIN "sku" s ON s."id" = ii."sku_id"
      WHERE i."status" IN ('OPEN', 'PARTIALLY_DISPATCHED') AND ii."quantity" > ii."dispatched_qty"
        ${customerFilter(f, Prisma.sql`i."customer_id"`)} ${productFilter(f)}`,
    prisma.$queryRaw<{ dispatches: number; customerReturns: number; pendingAdjustments: number }[]>`
      SELECT
        (SELECT COUNT(*) FROM "outward" o
          WHERE o."status" <> 'REVERSED' AND ${instantWithin(Prisma.sql`o."dispatched_at"`, f.period)}
            ${customerFilter(f, Prisma.sql`o."customer_id"`)})::int AS "dispatches",
        (SELECT COUNT(*) FROM "sales_return" sr
          WHERE sr."status" <> 'REVERSED' AND ${instantWithin(Prisma.sql`sr."returned_at"`, f.period)}
            ${customerFilter(f, Prisma.sql`sr."customer_id"`)})::int AS "customerReturns",
        (SELECT COUNT(*) FROM "adjustment" WHERE "status" = 'SUBMITTED')::int AS "pendingAdjustments"`,
    getReceiptTotals(f),
  ]);
  return {
    pendingPurchaseOrders: pos.count,
    overduePurchaseOrders: pos.overdue,
    pendingPurchaseValue: pos.value,
    invoicesAwaitingDispatch: invoices.count,
    pendingDispatchValue: invoices.value,
    dispatches: counts.dispatches,
    grns: receipts.grns,
    rejectionRate: receipts.rejectionRate,
    customerReturns: counts.customerReturns,
    pendingAdjustments: counts.pendingAdjustments,
  };
}

// ---------------------------------------------------------------------------
// Page read models (one per tab)
// ---------------------------------------------------------------------------

const series = (points: TrendPoint[], name: string) => points.map((p) => p.values[name]);

export async function getSalesKpis(f: AnalyticsFilters, trend?: TrendPoint[]) {
  const [current, previous, points] = await Promise.all([
    getSalesTotals(f),
    getSalesTotals(f, previousPeriod(f.period)),
    trend ?? getSalesTrend(f),
  ]);
  return {
    totals: current,
    sales: kpi(current.value, previous.value, series(points, "sales")),
    gst: kpi(current.gst, previous.gst, series(points, "gst")),
    invoices: kpi(String(current.invoices), String(previous.invoices)),
    averageInvoice: kpi(current.averageInvoice, previous.averageInvoice),
    quantity: kpi(current.quantity, previous.quantity),
  };
}

export async function getPurchaseKpis(f: AnalyticsFilters, trend?: TrendPoint[]) {
  const previous = previousPeriod(f.period);
  const [current, before, received, receivedBefore, points] = await Promise.all([
    getPurchaseTotals(f),
    getPurchaseTotals(f, previous),
    getReceiptTotals(f),
    getReceiptTotals(f, previous),
    trend ?? getPurchaseTrend(f),
  ]);
  return {
    totals: current,
    receipts: received,
    purchases: kpi(current.value, before.value, series(points, "ordered")),
    received: kpi(received.value, receivedBefore.value, series(points, "received")),
    orders: kpi(String(current.orders), String(before.orders)),
  };
}

export async function getAnalyticsOverview(f: AnalyticsFilters) {
  const [comparison, salesTrend, purchaseTrend, inventory, stock, operations, lowStock, outOfStock, topProducts, topCustomers] =
    await Promise.all([
      getSalesVsPurchasesTrend(f),
      getSalesTrend(f),
      getPurchaseTrend(f),
      getInventoryTotals(f),
      getStockMovementTrend(f),
      getOperationalKpis(f),
      getLowStock(f, 0),
      getOutOfStock(f, 0),
      getSalesByProduct(f, 5),
      getSalesByCustomer(f, 5),
    ]);
  const [sales, purchases] = await Promise.all([getSalesKpis(f, salesTrend), getPurchaseKpis(f, purchaseTrend)]);
  return {
    sales,
    purchases,
    inventory,
    inventoryValue: kpi(stock.closingValue, stock.openingValue, series(stock.points, "stockValue")),
    comparison,
    operations,
    lowStock: lowStock.skus,
    outOfStock: outOfStock.count,
    topProducts,
    topCustomers,
  };
}

export async function getInventoryAnalytics(f: AnalyticsFilters) {
  const [totals, movement, valuation, byCategory, ageing, fastMoving, slow, dead, lowStock, outOfStock] = await Promise.all([
    getInventoryTotals(f),
    getStockMovementTrend(f),
    getInventoryValuation(f),
    getInventoryByCategory(f),
    getStockAgeing(f),
    getFastMoving(f),
    getIdleStock(f, "slow"),
    getIdleStock(f, "dead"),
    getLowStock(f),
    getOutOfStock(f),
  ]);
  return {
    totals,
    inventoryValue: kpi(movement.closingValue, movement.openingValue, series(movement.points, "stockValue")),
    movement,
    valuation,
    byCategory,
    ageing,
    fastMoving,
    slow,
    dead,
    lowStock,
    outOfStock,
  };
}

export async function getSalesAnalytics(f: AnalyticsFilters) {
  const trend = await getSalesTrend(f);
  const [kpis, byProduct, byCustomer, byCategory] = await Promise.all([
    getSalesKpis(f, trend),
    getSalesByProduct(f),
    getSalesByCustomer(f),
    getSalesByCategory(f),
  ]);
  return { kpis, trend, byProduct, byCustomer, byCategory };
}

export async function getPurchasingAnalytics(f: AnalyticsFilters) {
  const trend = await getPurchaseTrend(f);
  const [kpis, comparison, bySupplier, pending] = await Promise.all([
    getPurchaseKpis(f, trend),
    getSalesVsPurchasesTrend(f),
    getPurchasesBySupplier(f),
    getPendingPurchaseOrders(f),
  ]);
  return { kpis, trend, comparison, bySupplier, pending };
}
