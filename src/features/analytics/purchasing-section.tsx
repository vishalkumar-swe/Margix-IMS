import Link from "next/link";
import { StatusBadge } from "@/components/shared/status-badge";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { formatDate } from "@/lib/dates";
import { formatMoney, formatQuantity } from "@/lib/format";
import type { getPurchasingAnalytics } from "@/server/modules/analytics/analytics.queries";
import { ChartPanel } from "./chart-panel";
import { BarBreakdownChart, TrendChart } from "./charts";
import { DataTable, EmptyPanel, isFlat, TrendTable } from "./data-tables";
import { DEFINITIONS } from "./definitions";
import { InfoHint } from "./info-hint";
import { KpiCard } from "./kpi-card";
import { exportHref, type AnalyticsView } from "./links";

type PurchasingData = Awaited<ReturnType<typeof getPurchasingAnalytics>>;

export function PurchasingSection({ data, view, comparison }: { data: PurchasingData; view: AnalyticsView; comparison: string }) {
  const { kpis, trend, comparison: salesVsPurchases, bySupplier, pending } = data;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Total purchases" value={formatMoney(kpis.purchases.current)} change={kpis.purchases.change} comparison={comparison} goodWhen="neutral" spark={kpis.purchases.spark} hint={DEFINITIONS.purchases} />
        <KpiCard label="Goods received" value={formatMoney(kpis.received.current)} change={kpis.received.change} comparison={comparison} goodWhen="neutral" spark={kpis.received.spark} hint={DEFINITIONS.received} footer={kpis.receipts.rejectionRate ? `${kpis.receipts.rejectionRate}% of received quantity rejected` : undefined} />
        <KpiCard
          label="Purchase orders"
          value={formatQuantity(kpis.orders.current)}
          change={kpis.orders.change}
          comparison={comparison}
          goodWhen="neutral"
          footer={`${kpis.totals.suppliers} supplier${kpis.totals.suppliers === 1 ? "" : "s"}`}
        />
        <KpiCard
          label="Pending purchase orders"
          value={formatQuantity(String(pending.count))}
          hint={DEFINITIONS.pendingPurchases}
          href="/purchase-orders?status=OPEN"
          footer={
            <>
              {formatMoney(pending.value)} to receive
              {pending.overdue > 0 && <span className="ml-1 font-medium text-red-700">· {pending.overdue} overdue</span>}
            </>
          }
        />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <ChartPanel
          title="Purchase trend"
          description="Ordered (by PO date) and received (by GRN date)"
          hint={`${DEFINITIONS.purchases} ${DEFINITIONS.received}`}
          csvHref={exportHref(view, "purchase-trend")}
          empty={isFlat(trend, ["ordered", "received"]) ? <EmptyPanel text="No purchases in this period." /> : undefined}
          chart={
            <TrendChart
              data={trend}
              series={[
                { key: "ordered", label: "Ordered", color: 1 },
                { key: "received", label: "Received", color: 2 },
              ]}
              ariaLabel="Purchase value ordered and received over time"
            />
          }
          table={
            <TrendTable
              points={trend}
              series={[
                { key: "ordered", label: "Ordered" },
                { key: "received", label: "Received" },
              ]}
            />
          }
        />
        <ChartPanel
          title="Purchases vs sales"
          description="Ordered value against invoiced value"
          hint={`${DEFINITIONS.purchases} ${DEFINITIONS.sales}`}
          empty={isFlat(salesVsPurchases, ["sales", "purchases"]) ? <EmptyPanel text="No purchases or sales in this period." /> : undefined}
          chart={
            <TrendChart
              data={salesVsPurchases}
              series={[
                { key: "sales", label: "Sales" },
                { key: "purchases", label: "Purchases" },
              ]}
              ariaLabel="Sales compared with purchases over time"
            />
          }
          table={
            <TrendTable
              points={salesVsPurchases}
              series={[
                { key: "sales", label: "Sales" },
                { key: "purchases", label: "Purchases" },
              ]}
            />
          }
        />
      </div>

      <ChartPanel
        title="Purchases by supplier"
        description="Ordered value in the period"
        csvHref={exportHref(view, "purchases-by-supplier")}
        empty={bySupplier.length === 0 ? <EmptyPanel text="No supplier activity in this period." /> : undefined}
        chart={
          <BarBreakdownChart
            data={bySupplier.map((r) => ({ label: r.supplierName, value: r.ordered }))}
            seriesLabel="Ordered"
            ariaLabel="Ordered value by supplier"
          />
        }
        table={
          <DataTable
            rows={bySupplier}
            rowKey={(r) => r.supplierId}
            columns={[
              { header: "Supplier", cell: (r) => <span className="font-medium">{r.supplierName}</span> },
              { header: "POs", numeric: true, cell: (r) => r.orders },
              { header: "Ordered", numeric: true, cell: (r) => formatMoney(r.ordered) },
              { header: "Received", numeric: true, cell: (r) => formatMoney(r.received) },
              { header: "Pending (all open POs)", numeric: true, cell: (r) => formatMoney(r.pending) },
            ]}
          />
        }
      />

      <Card>
        <CardHeader
          title={
            <span className="inline-flex items-center gap-1.5">
              Pending purchase orders
              <InfoHint text={DEFINITIONS.pendingPurchases} />
            </span>
          }
          description="Most urgent first (by expected date)"
          actions={
            <a href={exportHref(view, "pending-purchase-orders")} download className="text-sm font-medium text-brand-700 hover:underline">
              CSV
            </a>
          }
        />
        {pending.rows.length > 0 ? (
          <DataTable
            rows={pending.rows}
            rowKey={(r) => r.id}
            columns={[
              {
                header: "PO",
                cell: (r) => (
                  <Link href={`/purchase-orders/${r.id}`} className="font-medium hover:underline">
                    {r.poNumber}
                  </Link>
                ),
              },
              { header: "Supplier", cell: (r) => r.supplierName },
              { header: "Status", cell: (r) => <StatusBadge status={r.status} /> },
              { header: "Ordered", cell: (r) => formatDate(r.orderDate) },
              {
                header: "Expected",
                cell: (r) =>
                  r.expectedDate ? (
                    <span className="inline-flex items-center gap-2">
                      {formatDate(r.expectedDate)}
                      {r.overdue && <Badge tone="danger">Overdue</Badge>}
                    </span>
                  ) : (
                    "—"
                  ),
              },
              { header: "Pending value", numeric: true, cell: (r) => formatMoney(r.pending) },
            ]}
          />
        ) : (
          <EmptyPanel text="No purchase orders awaiting goods." />
        )}
      </Card>
    </div>
  );
}
