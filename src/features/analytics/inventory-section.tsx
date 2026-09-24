import Link from "next/link";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { formatDate } from "@/lib/dates";
import { formatMoney, formatQuantity } from "@/lib/format";
import type { getInventoryAnalytics, IdleStockRow } from "@/server/modules/analytics/analytics.queries";
import { ChartPanel } from "./chart-panel";
import { BarBreakdownChart, DonutChart, TrendChart } from "./charts";
import { DataTable, EmptyPanel, isFlat, TrendTable, type Column } from "./data-tables";
import { DEFINITIONS, slowHint } from "./definitions";
import { InfoHint } from "./info-hint";
import { KpiCard } from "./kpi-card";
import { exportHref, type AnalyticsView } from "./links";

type InventoryData = Awaited<ReturnType<typeof getInventoryAnalytics>>;

const skuCell = (r: { skuId: string; skuCode: string; skuName: string }) => (
  <>
    <Link href={`/stock/${r.skuId}`} className="font-medium hover:underline">
      {r.skuCode}
    </Link>
    <span className="block text-xs text-slate-500">{r.skuName}</span>
  </>
);

const idleColumns: Column<IdleStockRow>[] = [
  { header: "Product", cell: skuCell },
  { header: "Godown", cell: (r) => r.godownCode },
  { header: "Quantity", numeric: true, cell: (r) => `${formatQuantity(r.quantity)} ${r.unit}` },
  { header: "Value", numeric: true, cell: (r) => formatMoney(r.value) },
  { header: "Idle days", numeric: true, cell: (r) => r.daysIdle },
];

export function InventorySection({ data, view }: { data: InventoryData; view: AnalyticsView }) {
  const { totals, inventoryValue, movement, valuation, byCategory, ageing, fastMoving, slow, dead, lowStock, outOfStock } = data;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <KpiCard
          label="Inventory value"
          value={formatMoney(inventoryValue.current)}
          change={inventoryValue.change}
          comparison="vs start of period"
          goodWhen="neutral"
          spark={inventoryValue.spark}
          hint={DEFINITIONS.inventoryValue}
          footer={
            totals.noCostSkus > 0 ? (
              <span className="text-amber-800">
                {totals.noCostSkus} product{totals.noCostSkus === 1 ? "" : "s"} in stock without a cost
              </span>
            ) : undefined
          }
        />
        <KpiCard
          label="Stock on hand"
          value={formatQuantity(totals.quantity)}
          hint={DEFINITIONS.stockQuantity}
          footer={`${totals.skusInStock} product${totals.skusInStock === 1 ? "" : "s"} in stock`}
          href="/stock"
        />
        <KpiCard label="Low-stock products" value={String(lowStock.skus)} hint={DEFINITIONS.lowStock} href="/alerts" footer={`${lowStock.lines} godown alert${lowStock.lines === 1 ? "" : "s"}`} />
        <KpiCard label="Out-of-stock products" value={String(outOfStock.count)} hint={DEFINITIONS.outOfStock} />
        <KpiCard label="Slow-moving stock" value={formatMoney(slow.value)} hint={slowHint(slow.minDays, slow.maxDays)} footer={`${slow.skus} product${slow.skus === 1 ? "" : "s"} · ${slow.lines} stock line${slow.lines === 1 ? "" : "s"}`} />
        <KpiCard label="Dead stock" value={formatMoney(dead.value)} hint={slowHint(dead.minDays, dead.maxDays)} footer={`${dead.skus} product${dead.skus === 1 ? "" : "s"} · ${dead.lines} stock line${dead.lines === 1 ? "" : "s"}`} />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <ChartPanel
          className="xl:col-span-2"
          title="Stock movement"
          description="Inward and outward value per period"
          hint={DEFINITIONS.movement}
          csvHref={exportHref(view, "stock-movement-trend")}
          empty={isFlat(movement.points, ["inward", "outward"]) ? <EmptyPanel text="No stock movements in this period." /> : undefined}
          chart={
            <TrendChart
              data={movement.points}
              series={[
                { key: "inward", label: "Inward" },
                { key: "outward", label: "Outward" },
              ]}
              ariaLabel="Inward and outward stock value over time"
            />
          }
          table={
            <TrendTable
              points={movement.points}
              series={[
                { key: "inward", label: "Inward" },
                { key: "outward", label: "Outward" },
                { key: "adjustments", label: "Adjustments" },
                { key: "stockValue", label: "Closing value" },
              ]}
            />
          }
        />
        <ChartPanel
          title="Stock value by category"
          hint={DEFINITIONS.inventoryValue}
          empty={byCategory.every((r) => Number(r.value) === 0) ? <EmptyPanel text="No valued stock." /> : undefined}
          chart={<DonutChart data={byCategory.map((r) => ({ label: r.category, value: r.value }))} ariaLabel="Stock value by category" />}
          table={
            <DataTable
              rows={byCategory}
              rowKey={(r) => r.categoryId ?? "none"}
              columns={[
                { header: "Category", cell: (r) => r.category },
                { header: "Value", numeric: true, cell: (r) => formatMoney(r.value) },
              ]}
            />
          }
        />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <ChartPanel
          title="Stock ageing"
          description="Value by days since last movement"
          hint={DEFINITIONS.ageing}
          csvHref={exportHref(view, "stock-ageing")}
          empty={ageing.every((b) => b.lines === 0) ? <EmptyPanel text="No stock on hand." /> : undefined}
          chart={<BarBreakdownChart data={ageing.map((b) => ({ label: b.band, value: b.value }))} seriesLabel="Value" ariaLabel="Stock value by age band" />}
          table={
            <DataTable
              rows={ageing}
              rowKey={(r) => r.band}
              columns={[
                { header: "Days since movement", cell: (r) => r.band },
                { header: "Stock lines", numeric: true, cell: (r) => r.lines },
                { header: "Quantity", numeric: true, cell: (r) => formatQuantity(r.quantity) },
                { header: "Value", numeric: true, cell: (r) => formatMoney(r.value) },
              ]}
            />
          }
        />
        <ChartPanel
          title="Fast-moving products"
          description="Highest dispatched quantity in the period"
          hint={DEFINITIONS.fastMoving}
          csvHref={exportHref(view, "fast-moving")}
          empty={fastMoving.length === 0 ? <EmptyPanel text="Nothing dispatched in this period." /> : undefined}
          chart={
            <BarBreakdownChart
              data={fastMoving.map((r) => ({ label: `${r.skuCode} (${r.unit})`, value: r.quantity }))}
              format="quantity"
              seriesLabel="Dispatched"
              ariaLabel="Top products by dispatched quantity"
            />
          }
          table={
            <DataTable
              rows={fastMoving}
              rowKey={(r) => r.skuId}
              columns={[
                { header: "Product", cell: skuCell },
                { header: "Dispatched", numeric: true, cell: (r) => `${formatQuantity(r.quantity)} ${r.unit}` },
                { header: "Value at cost", numeric: true, cell: (r) => formatMoney(r.value) },
                { header: "Dispatches", numeric: true, cell: (r) => r.dispatches },
              ]}
            />
          }
        />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <ListCard title="Slow-moving stock" hint={slowHint(slow.minDays, slow.maxDays)} csvHref={exportHref(view, "slow-moving")} empty="No slow-moving stock.">
          {slow.rows.length > 0 && <DataTable rows={slow.rows} rowKey={(r) => `${r.skuId}-${r.godownCode}`} columns={idleColumns} />}
        </ListCard>
        <ListCard title="Dead stock" hint={slowHint(dead.minDays, dead.maxDays)} csvHref={exportHref(view, "dead-stock")} empty="No dead stock.">
          {dead.rows.length > 0 && <DataTable rows={dead.rows} rowKey={(r) => `${r.skuId}-${r.godownCode}`} columns={idleColumns} />}
        </ListCard>
        <ListCard title="Low-stock products" hint={DEFINITIONS.lowStock} csvHref={exportHref(view, "low-stock")} empty="Nothing below its reorder level.">
          {lowStock.rows.length > 0 && (
            <DataTable
              rows={lowStock.rows}
              rowKey={(r) => `${r.skuId}-${r.godownCode}`}
              columns={[
                { header: "Product", cell: skuCell },
                { header: "Godown", cell: (r) => r.godownCode },
                { header: "On hand", numeric: true, cell: (r) => `${formatQuantity(r.currentQty)} ${r.unit}` },
                { header: "Reorder level", numeric: true, cell: (r) => formatQuantity(r.reorderLevel) },
              ]}
            />
          )}
        </ListCard>
        <ListCard title="Out-of-stock products" hint={DEFINITIONS.outOfStock} csvHref={exportHref(view, "out-of-stock")} empty="Every active product has stock.">
          {outOfStock.rows.length > 0 && (
            <DataTable
              rows={outOfStock.rows}
              rowKey={(r) => r.skuId}
              columns={[
                { header: "Product", cell: skuCell },
                { header: "Category", cell: (r) => r.category ?? "—" },
                { header: "Last movement", cell: (r) => (r.lastMovementAt ? formatDate(r.lastMovementAt) : "Never stocked") },
              ]}
            />
          )}
        </ListCard>
      </div>

      <ListCard title="Most valuable stock" hint={DEFINITIONS.inventoryValue} csvHref={exportHref(view, "inventory-valuation")} empty="No stock on hand.">
        {valuation.length > 0 && (
          <DataTable
            rows={valuation}
            rowKey={(r) => r.skuId}
            columns={[
              { header: "Product", cell: skuCell },
              { header: "Category", cell: (r) => r.category ?? "—" },
              { header: "On hand", numeric: true, cell: (r) => `${formatQuantity(r.quantity)} ${r.unit}` },
              { header: "Unit cost", numeric: true, cell: (r) => (r.unitCost === null ? <Badge tone="warning">No cost</Badge> : `₹${formatQuantity(r.unitCost)}`) },
              { header: "Value", numeric: true, cell: (r) => formatMoney(r.value) },
            ]}
          />
        )}
      </ListCard>
    </div>
  );
}

function ListCard({
  title,
  hint,
  csvHref,
  empty,
  children,
}: {
  title: string;
  hint: string;
  csvHref: string;
  empty: string;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardHeader
        title={
          <span className="inline-flex items-center gap-1.5">
            {title}
            <InfoHint text={hint} />
          </span>
        }
        description="Top 10 · download CSV for the full list"
        actions={
          <a href={csvHref} download className="text-sm font-medium text-brand-700 hover:underline">
            CSV
          </a>
        }
      />
      {children || <EmptyPanel text={empty} />}
    </Card>
  );
}
