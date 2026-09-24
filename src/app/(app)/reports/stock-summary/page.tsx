import { ChartColumn } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { CsvDownloadLink } from "@/components/shared/csv-download-link";
import { FilterBar } from "@/components/shared/filter-bar";
import { Quantity } from "@/components/shared/quantity";
import { Alert } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { formatDate } from "@/lib/dates";
import { parseSearchParams, toQueryString } from "@/lib/search-params";
import { stockSummaryQuerySchema } from "@/lib/validation/reports";
import { requirePagePermission } from "@/server/auth/current-user";
import { listGodowns, listSkuOptions } from "@/server/modules/masters/masters.queries";
import { getStockSummary, REPORT_ROW_LIMIT } from "@/server/modules/reports/reports.queries";

export const metadata: Metadata = { title: "Stock summary" };

export default async function StockSummaryPage({ searchParams }: PageProps<"/reports/stock-summary">) {
  await requirePagePermission("report.view");
  const query = parseSearchParams(stockSummaryQuerySchema, await searchParams);
  const [{ range, rows }, godowns, skus] = await Promise.all([getStockSummary(query), listGodowns(), listSkuOptions()]);
  const byBatch = query.groupBy === "batch";
  const csvHref = `/api/v1/reports/stock-summary${toQueryString({ ...query, ...range, format: "csv" })}`;

  return (
    <>
      <PageHeader
        back={{ href: "/reports", label: "Reports" }}
        title={range.from === range.to ? `Daily inventory · ${formatDate(range.from)}` : "Stock summary"}
        description={`${formatDate(range.from)} – ${formatDate(range.to)} · Opening + Inward − Outward ± Adjustments = Closing`}
        actions={<CsvDownloadLink href={csvHref} />}
      />
      <Card>
        <FilterBar
          dates={[
            { name: "from", label: "From", value: range.from },
            { name: "to", label: "To", value: range.to },
          ]}
          selects={[
            {
              name: "godownId",
              label: "All godowns",
              value: query.godownId,
              options: godowns.map((g) => ({ value: g.id, label: `${g.code} · ${g.name}` })),
            },
            {
              name: "skuId",
              label: "All SKUs",
              value: query.skuId,
              options: skus.map((s) => ({ value: s.id, label: s.code })),
            },
            {
              name: "groupBy",
              label: "Per SKU × godown",
              value: query.groupBy === "batch" ? "batch" : undefined,
              options: [{ value: "batch", label: "Per SKU × godown × batch" }],
            },
          ]}
        />
        {rows.length >= REPORT_ROW_LIMIT && (
          <Alert tone="info" className="m-4">
            Showing the first {REPORT_ROW_LIMIT.toLocaleString("en-IN")} rows. Narrow the filters for a complete view.
          </Alert>
        )}
        {rows.length > 0 ? (
          <Table>
            <THead>
              <tr>
                <TH>SKU</TH>
                <TH>Godown</TH>
                {byBatch && <TH>Batch</TH>}
                <TH numeric>Opening</TH>
                <TH numeric>Inward</TH>
                <TH numeric>Outward</TH>
                <TH numeric>Adjustments</TH>
                <TH numeric>Closing</TH>
              </tr>
            </THead>
            <TBody>
              {rows.map((row) => (
                <TR key={`${row.skuId}-${row.godownCode}-${row.batchNumber ?? ""}`}>
                  <TD>
                    <Link href={`/stock/${row.skuId}`} className="font-medium hover:underline">
                      {row.skuCode}
                    </Link>
                    <span className="block text-xs text-slate-500">{row.skuName}</span>
                  </TD>
                  <TD>{row.godownCode}</TD>
                  {byBatch && <TD className="font-mono text-xs">{row.batchNumber}</TD>}
                  <TD numeric>
                    <Quantity value={row.opening} />
                  </TD>
                  <TD numeric>
                    <Quantity value={row.inward} />
                  </TD>
                  <TD numeric>
                    <Quantity value={row.outward} />
                  </TD>
                  <TD numeric>
                    <Quantity value={row.adjustments} signed />
                  </TD>
                  <TD numeric>
                    <Quantity value={row.closing} unit={row.unit} className="font-medium text-slate-900" />
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        ) : (
          <EmptyState icon={ChartColumn} title="No stock or movements for these filters" />
        )}
      </Card>
    </>
  );
}
