import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import type { Period } from "@/lib/analytics";
import { todayIst } from "@/lib/dates";
import type { Actor } from "@/server/actor";
import { prisma } from "@/server/db/client";
import { toDecimal } from "@/server/db/decimal";
import { approveAdjustment, createAdjustment } from "@/server/modules/adjustments/adjustments.service";
import { saveReorderRule } from "@/server/modules/alerts/alerts.service";
import {
  getAnalyticsOverview,
  getFastMoving,
  getIdleStock,
  getInventoryAnalytics,
  getInventoryTotals,
  getInventoryValuation,
  getLowStock,
  getOperationalKpis,
  getOutOfStock,
  getPendingPurchaseOrders,
  getPurchaseTotals,
  getPurchasesBySupplier,
  getReceiptTotals,
  getSalesAnalytics,
  getSalesByCategory,
  getSalesByCustomer,
  getSalesByProduct,
  getSalesKpis,
  getSalesTotals,
  getSalesTrend,
  getSalesVsPurchasesTrend,
  getStockAgeing,
  getStockMovementTrend,
  type AnalyticsFilters,
} from "@/server/modules/analytics/analytics.queries";
import { analyticsCsv } from "@/server/modules/analytics/analytics.export";
import { postDispatch } from "@/server/modules/dispatch/dispatch.service";
import { cancelInvoice, createInvoice } from "@/server/modules/invoices/invoice.service";
import { setSkuUnit } from "@/server/modules/masters/masters.service";
import { postOpeningBalance } from "@/server/modules/opening/opening.service";
import { postGrn } from "@/server/modules/purchasing/grn.service";
import { cancelPurchaseOrder, createPurchaseOrder } from "@/server/modules/purchasing/purchase-order.service";
import { saveStockAgingSettings } from "@/server/modules/settings/stock-aging";
import { GET as analyticsExportGet } from "@/app/api/v1/analytics/export/route";
import { callRoute, sessionCookieFor } from "../../helpers/http";
import { actorFor, createCustomer, createGodown, createSku, createSupplier, createUom, createUser } from "../../helpers/factories";

/**
 * Known dataset, posted through the real services:
 *
 * Purchases (August): PO1 S1 10-Aug  RM 100 KG @ 50 + FG 10 BOX(×24) @ 240  = 7,400
 *                     PO2 S2 20-Aug  RM 40 KG @ 55 (expected 25-Aug)         = 2,200
 *                     PO3 S2 draft, PO4 S1 cancelled                         → excluded
 * Receipt (today):    GRN on PO1: RM 100 received / 90 accepted, FG 240 PCS  = 4,500 + 2,400
 * Sales:              INV1 C1 15-Aug RM 20 @ 100 (18%) + FG 2 BOX @ 600 (12%) = 3,200 (GST 504)
 *                     INV2 C2 17-Aug RM 5 @ 110 (18%)                         =   550 (GST 99)
 *                     INV3 C2 17-Aug cancelled                                → excluded
 *                     INV4 C1 20-Jul RM 10 @ 100 (18%)                        = 1,000 (GST 180)
 * Stock movements (today): dispatch INV1 (RM 20, FG 48 PCS), adjustment RM −5,
 *                     opening XS 50 KG (never purchased → no cost).
 * On hand: RM 65 KG @ 55 = 3,575; FG 192 PCS @ 10 = 1,920; XS 50 KG (no cost); NS none.
 */

let admin: Actor;
let manager: Actor;
let operator: Actor;
let godownId: string;
let rm: { id: string; code: string };
let fg: { id: string; code: string };
let xs: { id: string; code: string };
let ns: { id: string; code: string };
let polymers: string;
let packaging: string;
let s1: string;
let s2: string;
let c1: string;
let c2: string;
let po1: string;
let po2: string;

const august: Period = { from: "2026-08-01", to: "2026-08-31" };
const today = todayIst();
const todayOnly: Period = { from: today, to: today };
const filters = (period: Period, extra: Partial<AnalyticsFilters> = {}): AnalyticsFilters => ({ period, ...extra });

beforeEach(async () => {
  admin = actorFor(await createUser("ADMIN"));
  manager = actorFor(await createUser("STORE_MANAGER"));
  operator = actorFor(await createUser("WAREHOUSE_OPERATOR"));
  godownId = (await createGodown()).id;
  polymers = (await prisma.category.create({ data: { name: "Polymers" } })).id;
  packaging = (await prisma.category.create({ data: { name: "Packaging" } })).id;

  rm = await createSku({ code: "RM-1" });
  fg = await createSku({ code: "FG-1", uomCode: "PCS" });
  xs = await createSku({ code: "XS-1" });
  ns = await createSku({ code: "NS-1" });
  await prisma.sku.update({ where: { id: rm.id }, data: { categoryId: polymers } });
  await prisma.sku.update({ where: { id: fg.id }, data: { categoryId: packaging } });
  const box = await createUom("BOX", 0);
  await setSkuUnit(admin, fg.id, { uomId: box.id, factor: "24" });

  s1 = (await createSupplier()).id;
  s2 = (await createSupplier()).id;
  c1 = (await createCustomer()).id;
  c2 = (await createCustomer()).id;

  const po1Doc = await createPurchaseOrder(manager, {
    supplierId: s1,
    orderDate: "2026-08-10",
    submit: true,
    items: [
      { skuId: rm.id, orderedQty: "100", rate: "50", gstRate: "18" },
      { skuId: fg.id, orderedQty: "10", uomId: box.id, rate: "240", gstRate: "12" },
    ],
  });
  po1 = po1Doc.id;
  po2 = (
    await createPurchaseOrder(manager, {
      supplierId: s2,
      orderDate: "2026-08-20",
      expectedDate: "2026-08-25",
      submit: true,
      items: [{ skuId: rm.id, orderedQty: "40", rate: "55" }],
    })
  ).id;
  await createPurchaseOrder(manager, {
    supplierId: s2,
    orderDate: "2026-08-21",
    submit: false,
    items: [{ skuId: rm.id, orderedQty: "10", rate: "999" }],
  });
  const po4 = await createPurchaseOrder(manager, {
    supplierId: s1,
    orderDate: "2026-08-22",
    submit: true,
    items: [{ skuId: fg.id, orderedQty: "5", rate: "1" }],
  });
  await cancelPurchaseOrder(manager, po4.id, "Duplicate");

  const lines = await prisma.purchaseOrderItem.findMany({ where: { purchaseOrderId: po1 }, orderBy: { lineNo: "asc" } });
  await postGrn(operator, po1, {
    godownId,
    items: [
      { purchaseOrderItemId: lines[0].id, batchNumber: "L1", receivedQty: "100", acceptedQty: "90", rejectionReason: "Wet" },
      { purchaseOrderItemId: lines[1].id, batchNumber: "L2", receivedQty: "240", acceptedQty: "240" },
    ],
  });
  await postOpeningBalance(admin, { godownId, asOf: "2026-04-01", items: [{ skuId: xs.id, batchNumber: "X1", quantity: "50" }] });

  const inv1 = await createInvoice(manager, {
    customerId: c1,
    invoiceDate: "2026-08-15",
    items: [
      { skuId: rm.id, quantity: "20", rate: "100", gstRate: "18" },
      { skuId: fg.id, quantity: "2", uomId: box.id, rate: "600", gstRate: "12" },
    ],
  });
  await createInvoice(manager, {
    customerId: c2,
    invoiceDate: "2026-08-17",
    items: [{ skuId: rm.id, quantity: "5", rate: "110", gstRate: "18" }],
  });
  const inv3 = await createInvoice(manager, {
    customerId: c2,
    invoiceDate: "2026-08-17",
    items: [{ skuId: rm.id, quantity: "1", rate: "1000", gstRate: "18" }],
  });
  await cancelInvoice(manager, inv3.id, "Wrong customer");
  await createInvoice(manager, {
    customerId: c1,
    invoiceDate: "2026-07-20",
    items: [{ skuId: rm.id, quantity: "10", rate: "100", gstRate: "18" }],
  });

  const batchOf = (skuId: string, batchNumber: string) =>
    prisma.batch.findFirstOrThrow({ where: { skuId, batchNumber } }).then((b) => b.id);
  const rmBatch = await batchOf(rm.id, "L1");
  await postDispatch(operator, {
    godownId,
    invoiceId: inv1.id,
    items: [
      { skuId: rm.id, batchId: rmBatch, quantity: "20" },
      { skuId: fg.id, batchId: await batchOf(fg.id, "L2"), quantity: "48" },
    ],
  });
  const adjustment = await createAdjustment(operator, {
    godownId,
    reasonCode: "DAMAGE",
    items: [{ skuId: rm.id, batchId: rmBatch, quantity: "-5" }],
  });
  await approveAdjustment(manager, adjustment.id);
});

describe("sales analytics", () => {
  it("totals invoiced value and GST, excluding cancelled invoices and honouring alternate units", async () => {
    expect(await getSalesTotals(filters(august))).toEqual({
      value: "3750.00",
      gst: "603.00",
      invoices: 2,
      customers: 2,
      quantity: "73",
      averageInvoice: "1875.00",
    });
  });

  it("compares with the previous equal period", async () => {
    const kpis = await getSalesKpis(filters(august));
    // Previous period of 1–31 Aug is 1–31 Jul: INV4 only.
    expect(kpis.sales).toMatchObject({ current: "3750.00", previous: "1000.00", change: 275 });
    expect(kpis.gst).toMatchObject({ current: "603.00", previous: "180.00", change: 235 });
    expect(kpis.invoices).toMatchObject({ current: "2", previous: "1", change: 100 });
    expect(kpis.sales.spark).toHaveLength(31);
  });

  it("breaks sales down by product, customer and category", async () => {
    const f = filters(august);
    expect(await getSalesByProduct(f)).toMatchObject([
      { skuCode: "RM-1", category: "Polymers", quantity: "25", value: "2550.00", gst: "459.00" },
      { skuCode: "FG-1", category: "Packaging", quantity: "48", value: "1200.00", gst: "144.00" },
    ]);
    expect(await getSalesByCustomer(f)).toMatchObject([
      { customerId: c1, invoices: 1, value: "3200.00", gst: "504.00" },
      { customerId: c2, invoices: 1, value: "550.00", gst: "99.00" },
    ]);
    expect(await getSalesByCategory(f)).toEqual([
      { categoryId: polymers, category: "Polymers", value: "2550.00" },
      { categoryId: packaging, category: "Packaging", value: "1200.00" },
    ]);
  });

  it("filters by customer, category and product", async () => {
    expect((await getSalesTotals(filters(august, { customerId: c2 }))).value).toBe("550.00");
    expect((await getSalesTotals(filters(august, { categoryId: packaging }))).value).toBe("1200.00");
    expect((await getSalesTotals(filters(august, { skuId: rm.id }))).gst).toBe("459.00");
    expect((await getSalesTotals(filters(august, { skuId: rm.id, customerId: c1 }))).value).toBe("2000.00");
  });

  it("buckets by day, ISO week (Monday) and month", async () => {
    const daily = await getSalesTrend(filters(august));
    expect(daily).toHaveLength(31);
    expect(daily.find((p) => p.bucket === "2026-08-15")?.values).toEqual({ sales: "3200.00", gst: "504.00" });
    expect(daily.find((p) => p.bucket === "2026-08-16")?.values).toEqual({ sales: "0", gst: "0" });

    // 1 Jul – 30 Sep is 92 days → weekly. 15 Aug (Sat) falls in the week of Mon 10 Aug; 17 Aug starts a new week.
    const weekly = await getSalesTrend(filters({ from: "2026-07-01", to: "2026-09-30" }));
    expect(weekly[0].bucket).toBe("2026-06-29");
    expect(weekly.find((p) => p.bucket === "2026-08-10")?.values.sales).toBe("3200.00");
    expect(weekly.find((p) => p.bucket === "2026-08-17")?.values.sales).toBe("550.00");
    expect(weekly.find((p) => p.bucket === "2026-07-20")?.values.sales).toBe("1000.00");

    const monthly = await getSalesTrend(filters({ from: "2026-04-01", to: "2027-03-31" }));
    expect(monthly.map((p) => p.bucket)).toHaveLength(12);
    expect(monthly.find((p) => p.bucket === "2026-07-01")?.values.sales).toBe("1000.00");
    expect(monthly.find((p) => p.bucket === "2026-08-01")?.values).toEqual({ sales: "3750.00", gst: "603.00" });
    expect(monthly[3].label).toBe("Jul 2026");
  });
});

describe("purchasing analytics", () => {
  it("values submitted, non-cancelled orders and the goods received against them", async () => {
    expect(await getPurchaseTotals(filters(august))).toEqual({ value: "9600.00", orders: 2, suppliers: 2 });
    expect(await getPurchaseTotals(filters(august, { supplierId: s1 }))).toEqual({ value: "7400.00", orders: 1, suppliers: 1 });
    expect((await getPurchaseTotals(filters(august, { categoryId: packaging }))).value).toBe("2400.00");

    // Received today: 90 KG × 50 + 240 PCS ÷ 24 × 240; 10 of 340 received units rejected.
    expect(await getReceiptTotals(filters(todayOnly))).toEqual({
      value: "6900.00",
      grns: 1,
      receivedQty: "340",
      rejectedQty: "10",
      rejectionRate: "2.9",
    });
    expect((await getReceiptTotals(filters(august))).value).toBe("0.00");
  });

  it("reports supplier-wise ordered, received and pending values", async () => {
    const rows = await getPurchasesBySupplier(filters({ from: "2026-08-01", to: today }));
    expect(rows).toMatchObject([
      { supplierId: s1, orders: 1, ordered: "7400.00", received: "6900.00", pending: "500.00" },
      { supplierId: s2, orders: 1, ordered: "2200.00", received: "0.00", pending: "2200.00" },
    ]);
  });

  it("lists pending purchase orders with overdue ones first", async () => {
    const pending = await getPendingPurchaseOrders(filters(august));
    expect(pending).toMatchObject({ count: 2, overdue: 1, value: "2700.00" });
    expect(pending.rows.map((r) => [r.id, r.expectedDate, r.overdue, r.pending])).toEqual([
      [po2, "2026-08-25", true, "2200.00"],
      [po1, null, false, "500.00"],
    ]);
    expect((await getPendingPurchaseOrders(filters(august, { supplierId: s1 }))).value).toBe("500.00");
  });

  it("compares sales and purchases per bucket", async () => {
    const points = await getSalesVsPurchasesTrend(filters({ from: "2026-08-01", to: "2026-08-31" }));
    expect(points.find((p) => p.bucket === "2026-08-10")?.values).toEqual({ sales: "0", purchases: "7400.00" });
    expect(points.find((p) => p.bucket === "2026-08-15")?.values).toEqual({ sales: "3200.00", purchases: "0" });
  });
});

describe("inventory analytics", () => {
  it("values stock at the latest purchase cost and flags stock without a cost", async () => {
    // RM: latest submitted PO rate is 55 (PO2); the draft at 999 is ignored. FG: 240 per BOX of 24 = 10 per PCS.
    expect(await getInventoryTotals(filters(august))).toEqual({
      value: "5495.00",
      quantity: "307",
      skusInStock: 3,
      noCostSkus: 1,
      noCostQuantity: "50",
    });
    const rows = await getInventoryValuation(filters(august));
    expect(rows.map((r) => [r.skuCode, r.quantity, r.unitCost, r.value, r.noCost])).toEqual([
      ["RM-1", "65", "55.0000", "3575.00", false],
      ["FG-1", "192", "10.0000", "1920.00", false],
      ["XS-1", "50", null, "0.00", true],
    ]);
    expect((await getInventoryTotals(filters(august, { categoryId: packaging }))).value).toBe("1920.00");
  });

  it("reconstructs stock value over the period from the ledger", async () => {
    const { movement, inventoryValue } = await getInventoryAnalytics(filters(todayOnly));
    expect(movement.openingValue).toBe("0.00");
    expect(movement.closingValue).toBe("5495.00");
    expect(movement.points).toHaveLength(1);
    expect(movement.points[0].values).toEqual({
      inward: "7350.00",
      outward: "1580.00",
      adjustments: "-275.00",
      inwardQty: "380",
      outwardQty: "68",
      stockValue: "5495.00",
    });
    expect(inventoryValue).toMatchObject({ current: "5495.00", previous: "0.00", change: null });

    // Before today nothing was in stock.
    const earlier = await getStockMovementTrend(filters(august));
    expect(earlier.openingValue).toBe("0.00");
    expect(earlier.closingValue).toBe("0.00");
  });

  it("buckets ledger movements by IST calendar day", async () => {
    const sku = await createSku({ code: "IST-1" });
    const batch = await prisma.batch.create({ data: { skuId: sku.id, batchNumber: "B" } });
    const entry = (createdAt: string, quantity: string, balanceAfter: string) =>
      prisma.inventoryLedger.create({
        data: {
          skuId: sku.id,
          godownId,
          batchId: batch.id,
          movementType: "OPENING",
          quantity: toDecimal(quantity),
          balanceAfter: toDecimal(balanceAfter),
          referenceType: "OPENING_BALANCE",
          referenceId: randomUUID(),
          referenceNo: "LEGACY",
          createdById: admin.userId,
          createdAt: new Date(createdAt),
        },
      });
    await entry("2026-09-10T18:29:59.999Z", "3", "3"); // 10 Sep, 23:59:59 IST
    await entry("2026-09-10T18:30:00.000Z", "7", "10"); // 11 Sep, 00:00 IST

    const { points } = await getStockMovementTrend(filters({ from: "2026-09-10", to: "2026-09-11" }, { skuId: sku.id }));
    expect(points.map((p) => [p.bucket, p.values.inwardQty])).toEqual([
      ["2026-09-10", "3"],
      ["2026-09-11", "7"],
    ]);
  });

  it("ranks fast movers by dispatched quantity", async () => {
    const rows = await getFastMoving(filters(todayOnly));
    expect(rows.map((r) => [r.skuCode, r.quantity, r.value, r.dispatches])).toEqual([
      ["FG-1", "48", "480.00", 1],
      ["RM-1", "20", "1100.00", 1],
    ]);
    expect(await getFastMoving(filters(august))).toEqual([]);
  });

  it("classifies slow and dead stock with the configured thresholds and ages stock", async () => {
    const legacy = async (code: string, daysAgo: number) => {
      const sku = await createSku({ code });
      const batch = await prisma.batch.create({ data: { skuId: sku.id, batchNumber: "OLD" } });
      await prisma.inventoryLedger.create({
        data: {
          skuId: sku.id,
          godownId,
          batchId: batch.id,
          movementType: "OPENING",
          quantity: toDecimal("4"),
          balanceAfter: toDecimal("4"),
          referenceType: "OPENING_BALANCE",
          referenceId: randomUUID(),
          referenceNo: "LEGACY",
          createdById: admin.userId,
          createdAt: new Date(Date.now() - daysAgo * 86_400_000),
        },
      });
      await prisma.stockBalance.create({ data: { skuId: sku.id, godownId, batchId: batch.id, quantity: toDecimal("4") } });
      return sku;
    };
    const slowSku = await legacy("SLOW-1", 45);
    const deadSku = await legacy("DEAD-1", 120);

    const slow = await getIdleStock(filters(august), "slow");
    const dead = await getIdleStock(filters(august), "dead");
    expect(slow).toMatchObject({ minDays: 30, maxDays: 90, lines: 1, skus: 1, value: "0.00" });
    expect(slow.rows.map((r) => [r.skuId, r.daysIdle])).toEqual([[slowSku.id, 45]]);
    expect(dead).toMatchObject({ minDays: 90, maxDays: null, lines: 1, skus: 1 });
    expect(dead.rows.map((r) => [r.skuId, r.daysIdle])).toEqual([[deadSku.id, 120]]);

    expect(await getStockAgeing(filters(august))).toEqual([
      { band: "0–30 days", lines: 3, quantity: "307", value: "5495.00" },
      { band: "31–60 days", lines: 1, quantity: "4", value: "0.00" },
      { band: "61–90 days", lines: 0, quantity: "0", value: "0.00" },
      { band: "91–180 days", lines: 1, quantity: "4", value: "0.00" },
      { band: "Over 180 days", lines: 0, quantity: "0", value: "0.00" },
    ]);

    // Administrators may override the env-default thresholds (Admin → Notifications). Every
    // consumer of the slow/dead-stock bands must honour the override, this one included.
    await saveStockAgingSettings(admin, { slowStockDays: 40, deadStockDays: 100, scanTime: "08:00" });
    const slowAfterOverride = await getIdleStock(filters(august), "slow");
    const deadAfterOverride = await getIdleStock(filters(august), "dead");
    expect(slowAfterOverride).toMatchObject({ minDays: 40, maxDays: 100, lines: 1, skus: 1 });
    expect(slowAfterOverride.rows.map((r) => r.skuId)).toEqual([slowSku.id]);
    expect(deadAfterOverride).toMatchObject({ minDays: 100, maxDays: null, lines: 1, skus: 1 });
    expect(deadAfterOverride.rows.map((r) => r.skuId)).toEqual([deadSku.id]);
  });

  it("counts low-stock and out-of-stock products", async () => {
    await saveReorderRule(admin, { skuId: rm.id, godownId, reorderLevel: "100", isActive: true });
    const low = await getLowStock(filters(august));
    expect(low).toMatchObject({ skus: 1, lines: 1 });
    expect(low.rows[0]).toMatchObject({ skuCode: "RM-1", currentQty: "65", reorderLevel: "100" });
    expect((await getLowStock(filters(august, { categoryId: packaging }))).skus).toBe(0);

    const out = await getOutOfStock(filters(august));
    expect(out.count).toBe(1);
    expect(out.rows.map((r) => [r.skuId, r.lastMovementAt])).toEqual([[ns.id, null]]);
  });
});

describe("overview and operations", () => {
  it("summarises operational KPIs", async () => {
    expect(await getOperationalKpis(filters(todayOnly))).toEqual({
      pendingPurchaseOrders: 2,
      overduePurchaseOrders: 1,
      pendingPurchaseValue: "2700.00",
      // INV2 (5 × 110) and INV4 (10 × 100) are not dispatched yet.
      invoicesAwaitingDispatch: 2,
      pendingDispatchValue: "1550.00",
      dispatches: 1,
      grns: 1,
      rejectionRate: "2.9",
      customerReturns: 0,
      pendingAdjustments: 0,
    });
  });

  it("assembles every tab from the same figures", async () => {
    const f = filters({ from: "2026-08-01", to: today });
    const [overview, sales] = await Promise.all([getAnalyticsOverview(f), getSalesAnalytics(f)]);
    expect(overview.sales.sales.current).toBe("3750.00");
    expect(overview.purchases.purchases.current).toBe("9600.00");
    expect(overview.purchases.received.current).toBe("6900.00");
    expect(overview.inventoryValue.current).toBe("5495.00");
    expect(overview.outOfStock).toBe(1);
    expect(overview.topCustomers[0].customerId).toBe(c1);
    expect(sales.trend.reduce((sum, p) => sum + Number(p.values.sales), 0)).toBe(3750);

    // Unrelated XS opening and no purchases for NS: inventory filters narrow every figure.
    expect((await getInventoryAnalytics(filters(todayOnly, { skuId: xs.id }))).totals).toMatchObject({
      value: "0.00",
      noCostSkus: 1,
    });
  });

  it("exports sections as CSV with the on-screen columns", async () => {
    const csv = await analyticsCsv("sales-by-customer", filters(august));
    const lines = csv.split("\r\n");
    expect(lines[0]).toBe("Customer code,Customer,Invoices,Sales value,GST");
    expect(lines).toHaveLength(3);
    expect(lines[1]).toMatch(/,1,3200\.00,504\.00$/);

    const kpis = (await analyticsCsv("kpis", filters(august))).split("\r\n");
    expect(kpis[0]).toBe("Metric,Current period,Previous period,Change %");
    expect(kpis).toContain("Sales value,3750.00,1000.00,275");
  });

  it("serves CSV downloads to report viewers only, with the page filters", async () => {
    const viewer = await createUser("MANAGEMENT");
    const cookie = await sessionCookieFor(viewer.id);
    const url = `http://localhost:3000/api/v1/analytics/export?section=sales-by-product&preset=custom&from=2026-08-01&to=2026-08-31&customerId=${c2}`;
    const response = await analyticsExportGet(new Request(url, { headers: { cookie, host: "localhost:3000" } }), {
      params: Promise.resolve({}),
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-disposition")).toBe(
      'attachment; filename="analytics-sales-by-product_2026-08-01_2026-08-31.csv"',
    );
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const lines = new TextDecoder().decode(bytes.slice(3)).trim().split("\r\n");
    expect(lines).toHaveLength(2);
    expect(lines[1]).toMatch(/^RM-1,.*,5,KG,550\.00,99\.00$/);

    expect((await callRoute(analyticsExportGet, { path: "/api/v1/analytics/export?section=nope", cookie })).status).toBe(400);
    expect((await callRoute(analyticsExportGet, { path: "/api/v1/analytics/export?section=kpis" })).status).toBe(401);
  });
});
