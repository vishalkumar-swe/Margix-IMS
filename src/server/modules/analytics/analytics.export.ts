import type { AnalyticsExportSection, TrendPoint } from "@/lib/analytics";
import { toCsv, type CsvColumn } from "@/server/http/csv";
import { REPORT_ROW_LIMIT } from "@/server/modules/reports/reports.queries";
import {
  getFastMoving,
  getIdleStock,
  getInventoryValuation,
  getLowStock,
  getOutOfStock,
  getPendingPurchaseOrders,
  getPurchaseKpis,
  getPurchasesBySupplier,
  getPurchaseTrend,
  getSalesByCategory,
  getSalesByCustomer,
  getSalesByProduct,
  getSalesKpis,
  getSalesTrend,
  getStockAgeing,
  getStockMovementTrend,
  type AnalyticsFilters,
  type IdleStockRow,
  type Kpi,
} from "./analytics.queries";

/** CSV layouts for GET /api/v1/analytics/export (column order = on-screen order). */

const trendCsv = (points: TrendPoint[], columns: [header: string, series: string][]) =>
  toCsv<TrendPoint>(
    [
      { header: "Period start", value: (p) => p.bucket },
      { header: "Period", value: (p) => p.label },
      ...columns.map(([header, series]) => ({ header, value: (p: TrendPoint) => p.values[series] })),
    ],
    points,
  );

const idleColumns: CsvColumn<IdleStockRow>[] = [
  { header: "SKU", value: (r) => r.skuCode },
  { header: "Name", value: (r) => r.skuName },
  { header: "Godown", value: (r) => r.godownCode },
  { header: "Quantity", value: (r) => r.quantity },
  { header: "Unit", value: (r) => r.unit },
  { header: "Value", value: (r) => r.value },
  { header: "Last movement", value: (r) => r.lastMovementAt },
  { header: "Days since movement", value: (r) => r.daysIdle },
];

async function kpiCsv(f: AnalyticsFilters): Promise<string> {
  const [sales, purchases, stock] = await Promise.all([getSalesKpis(f), getPurchaseKpis(f), getStockMovementTrend(f)]);
  const rows: [string, Kpi][] = [
    ["Sales value", sales.sales],
    ["GST collected", sales.gst],
    ["Invoices", sales.invoices],
    ["Average invoice value", sales.averageInvoice],
    ["Purchase value", purchases.purchases],
    ["Received value", purchases.received],
    ["Purchase orders", purchases.orders],
    // Previous = stock value at the start of the period.
    ["Inventory value", { current: stock.closingValue, previous: stock.openingValue, change: null, spark: [] }],
  ];
  return toCsv<[string, Kpi]>(
    [
      { header: "Metric", value: ([label]) => label },
      { header: "Current period", value: ([, k]) => k.current },
      { header: "Previous period", value: ([, k]) => k.previous },
      { header: "Change %", value: ([, k]) => k.change },
    ],
    rows,
  );
}

export async function analyticsCsv(section: AnalyticsExportSection, f: AnalyticsFilters): Promise<string> {
  const limit = REPORT_ROW_LIMIT;
  switch (section) {
    case "kpis":
      return kpiCsv(f);
    case "sales-trend":
      return trendCsv(await getSalesTrend(f), [
        ["Sales value", "sales"],
        ["GST", "gst"],
      ]);
    case "sales-by-product":
      return toCsv(
        [
          { header: "SKU", value: (r) => r.skuCode },
          { header: "Name", value: (r) => r.skuName },
          { header: "Category", value: (r) => r.category },
          { header: "Quantity", value: (r) => r.quantity },
          { header: "Unit", value: (r) => r.unit },
          { header: "Sales value", value: (r) => r.value },
          { header: "GST", value: (r) => r.gst },
        ],
        await getSalesByProduct(f, limit),
      );
    case "sales-by-customer":
      return toCsv(
        [
          { header: "Customer code", value: (r) => r.customerCode },
          { header: "Customer", value: (r) => r.customerName },
          { header: "Invoices", value: (r) => r.invoices },
          { header: "Sales value", value: (r) => r.value },
          { header: "GST", value: (r) => r.gst },
        ],
        await getSalesByCustomer(f, limit),
      );
    case "sales-by-category":
      return toCsv(
        [
          { header: "Category", value: (r) => r.category },
          { header: "Sales value", value: (r) => r.value },
        ],
        await getSalesByCategory(f),
      );
    case "purchase-trend":
      return trendCsv(await getPurchaseTrend(f), [
        ["Ordered value", "ordered"],
        ["Received value", "received"],
      ]);
    case "purchases-by-supplier":
      return toCsv(
        [
          { header: "Supplier code", value: (r) => r.supplierCode },
          { header: "Supplier", value: (r) => r.supplierName },
          { header: "Purchase orders", value: (r) => r.orders },
          { header: "Ordered value", value: (r) => r.ordered },
          { header: "Received value", value: (r) => r.received },
          { header: "Pending value", value: (r) => r.pending },
        ],
        await getPurchasesBySupplier(f, limit),
      );
    case "pending-purchase-orders":
      return toCsv(
        [
          { header: "PO", value: (r) => r.poNumber },
          { header: "Supplier", value: (r) => r.supplierName },
          { header: "Status", value: (r) => r.status },
          { header: "Order date", value: (r) => r.orderDate },
          { header: "Expected", value: (r) => r.expectedDate },
          { header: "Overdue", value: (r) => (r.overdue ? "Yes" : "No") },
          { header: "Ordered value", value: (r) => r.ordered },
          { header: "Pending value", value: (r) => r.pending },
        ],
        (await getPendingPurchaseOrders(f, limit)).rows,
      );
    case "inventory-valuation":
      return toCsv(
        [
          { header: "SKU", value: (r) => r.skuCode },
          { header: "Name", value: (r) => r.skuName },
          { header: "Category", value: (r) => r.category },
          { header: "Quantity", value: (r) => r.quantity },
          { header: "Unit", value: (r) => r.unit },
          { header: "Unit cost", value: (r) => r.unitCost },
          { header: "Value", value: (r) => r.value },
          { header: "No cost", value: (r) => (r.noCost ? "Yes" : "No") },
        ],
        await getInventoryValuation(f, limit),
      );
    case "stock-movement-trend":
      return trendCsv((await getStockMovementTrend(f)).points, [
        ["Inward value", "inward"],
        ["Outward value", "outward"],
        ["Adjustments value", "adjustments"],
        ["Inward quantity", "inwardQty"],
        ["Outward quantity", "outwardQty"],
        ["Closing stock value", "stockValue"],
      ]);
    case "fast-moving":
      return toCsv(
        [
          { header: "SKU", value: (r) => r.skuCode },
          { header: "Name", value: (r) => r.skuName },
          { header: "Dispatched quantity", value: (r) => r.quantity },
          { header: "Unit", value: (r) => r.unit },
          { header: "Value at cost", value: (r) => r.value },
          { header: "Dispatches", value: (r) => r.dispatches },
        ],
        await getFastMoving(f, limit),
      );
    case "slow-moving":
      return toCsv(idleColumns, (await getIdleStock(f, "slow", limit)).rows);
    case "dead-stock":
      return toCsv(idleColumns, (await getIdleStock(f, "dead", limit)).rows);
    case "stock-ageing":
      return toCsv(
        [
          { header: "Days since last movement", value: (r) => r.band },
          { header: "Stock lines", value: (r) => r.lines },
          { header: "Quantity", value: (r) => r.quantity },
          { header: "Value", value: (r) => r.value },
        ],
        await getStockAgeing(f),
      );
    case "low-stock":
      return toCsv(
        [
          { header: "SKU", value: (r) => r.skuCode },
          { header: "Name", value: (r) => r.skuName },
          { header: "Godown", value: (r) => r.godownCode },
          { header: "On hand", value: (r) => r.currentQty },
          { header: "Reorder level", value: (r) => r.reorderLevel },
          { header: "Unit", value: (r) => r.unit },
        ],
        (await getLowStock(f, limit)).rows,
      );
    case "out-of-stock":
      return toCsv(
        [
          { header: "SKU", value: (r) => r.skuCode },
          { header: "Name", value: (r) => r.skuName },
          { header: "Category", value: (r) => r.category },
          { header: "Last movement", value: (r) => r.lastMovementAt },
        ],
        (await getOutOfStock(f, limit)).rows,
      );
  }
}
