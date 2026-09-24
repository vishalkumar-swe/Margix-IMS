import Link from "next/link";
import { formatMoney, formatQuantity } from "@/lib/format";
import type { getSalesAnalytics } from "@/server/modules/analytics/analytics.queries";
import { ChartPanel } from "./chart-panel";
import { BarBreakdownChart, DonutChart, TrendChart } from "./charts";
import { DataTable, EmptyPanel, isFlat, TrendTable } from "./data-tables";
import { DEFINITIONS } from "./definitions";
import { KpiCard } from "./kpi-card";
import { exportHref, type AnalyticsView } from "./links";

type SalesData = Awaited<ReturnType<typeof getSalesAnalytics>>;

export function SalesSection({ data, view, comparison }: { data: SalesData; view: AnalyticsView; comparison: string }) {
  const { kpis, trend, byProduct, byCustomer, byCategory } = data;
  const noSales = kpis.totals.invoices === 0;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Total sales" value={formatMoney(kpis.sales.current)} change={kpis.sales.change} comparison={comparison} spark={kpis.sales.spark} hint={DEFINITIONS.sales} />
        <KpiCard label="GST collected" value={formatMoney(kpis.gst.current)} change={kpis.gst.change} comparison={comparison} spark={kpis.gst.spark} hint={DEFINITIONS.gst} />
        <KpiCard
          label="Invoices"
          value={formatQuantity(kpis.invoices.current)}
          change={kpis.invoices.change}
          comparison={comparison}
          hint={DEFINITIONS.invoices}
          footer={`${kpis.totals.customers} customer${kpis.totals.customers === 1 ? "" : "s"}`}
        />
        <KpiCard label="Average invoice" value={formatMoney(kpis.averageInvoice.current)} change={kpis.averageInvoice.change} comparison={comparison} hint={DEFINITIONS.averageInvoice} />
      </div>

      <ChartPanel
        title="Revenue trend"
        description="Sales value and GST per period"
        hint={DEFINITIONS.sales}
        csvHref={exportHref(view, "sales-trend")}
        empty={isFlat(trend, ["sales"]) ? <EmptyPanel text="No sales in this period." /> : undefined}
        chart={
          <TrendChart
            data={trend}
            series={[
              { key: "sales", label: "Sales" },
              { key: "gst", label: "GST" },
            ]}
            ariaLabel="Sales value and GST over time"
          />
        }
        table={
          <TrendTable
            points={trend}
            series={[
              { key: "sales", label: "Sales" },
              { key: "gst", label: "GST" },
            ]}
          />
        }
      />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <ChartPanel
          title="Top products"
          description="By sales value"
          csvHref={exportHref(view, "sales-by-product")}
          empty={noSales ? <EmptyPanel text="No sales in this period." /> : undefined}
          chart={
            <BarBreakdownChart
              data={byProduct.map((r) => ({ label: r.skuCode, value: r.value }))}
              seriesLabel="Sales"
              ariaLabel="Top products by sales value"
            />
          }
          table={
            <DataTable
              rows={byProduct}
              rowKey={(r) => r.skuId}
              columns={[
                {
                  header: "Product",
                  cell: (r) => (
                    <>
                      <Link href={`/stock/${r.skuId}`} className="font-medium hover:underline">
                        {r.skuCode}
                      </Link>
                      <span className="block text-xs text-slate-500">{r.skuName}</span>
                    </>
                  ),
                },
                { header: "Quantity", numeric: true, cell: (r) => `${formatQuantity(r.quantity)} ${r.unit}` },
                { header: "Sales", numeric: true, cell: (r) => formatMoney(r.value) },
                { header: "GST", numeric: true, cell: (r) => formatMoney(r.gst) },
              ]}
            />
          }
        />
        <ChartPanel
          title="Top customers"
          description="By sales value"
          csvHref={exportHref(view, "sales-by-customer")}
          empty={noSales ? <EmptyPanel text="No sales in this period." /> : undefined}
          chart={
            <BarBreakdownChart
              data={byCustomer.map((r) => ({ label: r.customerName, value: r.value }))}
              seriesLabel="Sales"
              ariaLabel="Top customers by sales value"
            />
          }
          table={
            <DataTable
              rows={byCustomer}
              rowKey={(r) => r.customerId}
              columns={[
                { header: "Customer", cell: (r) => <span className="font-medium">{r.customerName}</span> },
                { header: "Invoices", numeric: true, cell: (r) => r.invoices },
                { header: "Sales", numeric: true, cell: (r) => formatMoney(r.value) },
                { header: "GST", numeric: true, cell: (r) => formatMoney(r.gst) },
              ]}
            />
          }
        />
      </div>

      <ChartPanel
        title="Sales by category"
        description="Share of sales value"
        csvHref={exportHref(view, "sales-by-category")}
        empty={noSales ? <EmptyPanel text="No sales in this period." /> : undefined}
        chart={<DonutChart data={byCategory.map((r) => ({ label: r.category, value: r.value }))} ariaLabel="Sales value by category" />}
        table={
          <DataTable
            rows={byCategory}
            rowKey={(r) => r.categoryId ?? "none"}
            columns={[
              { header: "Category", cell: (r) => r.category },
              { header: "Sales", numeric: true, cell: (r) => formatMoney(r.value) },
            ]}
          />
        }
      />
    </div>
  );
}
