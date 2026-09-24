import Link from "next/link";
import { Card, CardHeader } from "@/components/ui/card";
import { formatMoney, formatQuantity } from "@/lib/format";
import type { getAnalyticsOverview } from "@/server/modules/analytics/analytics.queries";
import { ChartPanel } from "./chart-panel";
import { BarBreakdownChart, TrendChart } from "./charts";
import { DataTable, EmptyPanel, isFlat, TrendTable } from "./data-tables";
import { DEFINITIONS } from "./definitions";
import { InfoHint } from "./info-hint";
import { KpiCard } from "./kpi-card";
import { exportHref, tabHref, type AnalyticsView } from "./links";

type OverviewData = Awaited<ReturnType<typeof getAnalyticsOverview>>;

export function OverviewSection({ data, view, comparison }: { data: OverviewData; view: AnalyticsView; comparison: string }) {
  const { sales, purchases, inventory, inventoryValue, operations: ops } = data;
  const operations = [
    {
      label: "Pending purchase orders",
      value: `${ops.pendingPurchaseOrders}`,
      detail: `${formatMoney(ops.pendingPurchaseValue)} to receive${ops.overduePurchaseOrders ? ` · ${ops.overduePurchaseOrders} overdue` : ""}`,
      href: "/purchase-orders?status=OPEN",
      hint: DEFINITIONS.pendingPurchases,
      alert: ops.overduePurchaseOrders > 0,
    },
    {
      label: "Invoices awaiting dispatch",
      value: `${ops.invoicesAwaitingDispatch}`,
      detail: `${formatMoney(ops.pendingDispatchValue)} to dispatch`,
      href: "/invoices",
      hint: DEFINITIONS.awaitingDispatch,
    },
    { label: "Dispatches in period", value: `${ops.dispatches}`, href: "/dispatches" },
    {
      label: "Goods receipts in period",
      value: `${ops.grns}`,
      detail: ops.rejectionRate === null ? undefined : `${ops.rejectionRate}% rejected`,
      href: "/grns",
      hint: DEFINITIONS.rejection,
    },
    { label: "Customer returns in period", value: `${ops.customerReturns}`, href: "/sales-returns" },
    {
      label: "Adjustments awaiting approval",
      value: `${ops.pendingAdjustments}`,
      href: "/adjustments?status=SUBMITTED",
      alert: ops.pendingAdjustments > 0,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Total sales" value={formatMoney(sales.sales.current)} change={sales.sales.change} comparison={comparison} spark={sales.sales.spark} hint={DEFINITIONS.sales} href={tabHref(view, "sales")} />
        <KpiCard label="GST collected" value={formatMoney(sales.gst.current)} change={sales.gst.change} comparison={comparison} spark={sales.gst.spark} hint={DEFINITIONS.gst} />
        <KpiCard label="Total purchases" value={formatMoney(purchases.purchases.current)} change={purchases.purchases.change} comparison={comparison} goodWhen="neutral" spark={purchases.purchases.spark} hint={DEFINITIONS.purchases} href={tabHref(view, "purchasing")} />
        <KpiCard
          label="Inventory value"
          value={formatMoney(inventoryValue.current)}
          change={inventoryValue.change}
          comparison="vs start of period"
          goodWhen="neutral"
          spark={inventoryValue.spark}
          hint={DEFINITIONS.inventoryValue}
          href={tabHref(view, "inventory")}
          footer={inventory.noCostSkus > 0 ? `${inventory.noCostSkus} product${inventory.noCostSkus === 1 ? "" : "s"} without a cost` : undefined}
        />
        <KpiCard label="Stock on hand" value={formatQuantity(inventory.quantity)} hint={DEFINITIONS.stockQuantity} footer={`${inventory.skusInStock} products in stock`} href="/stock" />
        <KpiCard label="Low-stock products" value={String(data.lowStock)} hint={DEFINITIONS.lowStock} href="/alerts" />
        <KpiCard label="Out-of-stock products" value={String(data.outOfStock)} hint={DEFINITIONS.outOfStock} href={tabHref(view, "inventory")} />
        <KpiCard label="Goods received" value={formatMoney(purchases.received.current)} change={purchases.received.change} comparison={comparison} goodWhen="neutral" hint={DEFINITIONS.received} />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <ChartPanel
          className="xl:col-span-2"
          title="Sales vs purchases"
          description="Invoiced value against ordered value"
          hint={`${DEFINITIONS.sales} ${DEFINITIONS.purchases}`}
          empty={isFlat(data.comparison, ["sales", "purchases"]) ? <EmptyPanel text="No sales or purchases in this period." /> : undefined}
          chart={
            <TrendChart
              data={data.comparison}
              series={[
                { key: "sales", label: "Sales" },
                { key: "purchases", label: "Purchases" },
              ]}
              ariaLabel="Sales compared with purchases over time"
            />
          }
          table={
            <TrendTable
              points={data.comparison}
              series={[
                { key: "sales", label: "Sales" },
                { key: "purchases", label: "Purchases" },
              ]}
            />
          }
        />
        <Card>
          <CardHeader
            title="Operations"
            actions={
              <a href={exportHref(view, "kpis")} download className="text-sm font-medium text-brand-700 hover:underline">
                KPIs CSV
              </a>
            }
          />
          <ul className="divide-y divide-slate-100">
            {operations.map((item) => (
              <li key={item.label}>
                <Link href={item.href} className="flex items-center justify-between gap-3 px-5 py-3 text-sm hover:bg-slate-50">
                  <span>
                    <span className="flex items-center gap-1.5 text-slate-700">
                      {item.label}
                      {item.hint && <InfoHint text={item.hint} />}
                    </span>
                    {item.detail && <span className="block text-xs text-slate-500">{item.detail}</span>}
                  </span>
                  <span className={item.alert ? "font-semibold text-red-700 tabular-nums" : "font-semibold text-slate-900 tabular-nums"}>
                    {item.value}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <ChartPanel
          title="Top products"
          description="By sales value"
          csvHref={exportHref(view, "sales-by-product")}
          empty={data.topProducts.length === 0 ? <EmptyPanel text="No sales in this period." /> : undefined}
          chart={<BarBreakdownChart data={data.topProducts.map((r) => ({ label: r.skuCode, value: r.value }))} seriesLabel="Sales" ariaLabel="Top five products by sales value" />}
          table={
            <DataTable
              rows={data.topProducts}
              rowKey={(r) => r.skuId}
              columns={[
                { header: "Product", cell: (r) => `${r.skuCode} · ${r.skuName}` },
                { header: "Quantity", numeric: true, cell: (r) => `${formatQuantity(r.quantity)} ${r.unit}` },
                { header: "Sales", numeric: true, cell: (r) => formatMoney(r.value) },
              ]}
            />
          }
        />
        <ChartPanel
          title="Top customers"
          description="By sales value"
          csvHref={exportHref(view, "sales-by-customer")}
          empty={data.topCustomers.length === 0 ? <EmptyPanel text="No sales in this period." /> : undefined}
          chart={<BarBreakdownChart data={data.topCustomers.map((r) => ({ label: r.customerName, value: r.value }))} seriesLabel="Sales" ariaLabel="Top five customers by sales value" />}
          table={
            <DataTable
              rows={data.topCustomers}
              rowKey={(r) => r.customerId}
              columns={[
                { header: "Customer", cell: (r) => r.customerName },
                { header: "Invoices", numeric: true, cell: (r) => r.invoices },
                { header: "Sales", numeric: true, cell: (r) => formatMoney(r.value) },
              ]}
            />
          }
        />
      </div>
    </div>
  );
}
