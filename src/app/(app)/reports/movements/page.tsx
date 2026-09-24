import { ScrollText } from "lucide-react";
import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { CsvDownloadLink } from "@/components/shared/csv-download-link";
import { FilterBar } from "@/components/shared/filter-bar";
import { Alert } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { LedgerTable } from "@/features/ledger/ledger-table";
import { formatDate } from "@/lib/dates";
import { humanize } from "@/lib/format";
import { parseSearchParams, toQueryString } from "@/lib/search-params";
import { MOVEMENT_TYPES } from "@/lib/validation/ledger";
import { movementReportQuerySchema } from "@/lib/validation/reports";
import { requirePagePermission } from "@/server/auth/current-user";
import { listGodowns, listSkuOptions } from "@/server/modules/masters/masters.queries";
import { getMovementReport, REPORT_ROW_LIMIT } from "@/server/modules/reports/reports.queries";

export const metadata: Metadata = { title: "Movement report" };

export default async function MovementReportPage({ searchParams }: PageProps<"/reports/movements">) {
  await requirePagePermission("report.view");
  const query = parseSearchParams(movementReportQuerySchema, await searchParams);
  const [{ range, entries }, godowns, skus] = await Promise.all([getMovementReport(query), listGodowns(), listSkuOptions()]);
  const csvHref = `/api/v1/reports/movements${toQueryString({ ...query, ...range, format: "csv" })}`;

  return (
    <>
      <PageHeader
        back={{ href: "/reports", label: "Reports" }}
        title="Movement report"
        description={`${formatDate(range.from)} – ${formatDate(range.to)} · ${entries.length} entries`}
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
              options: godowns.map((g) => ({ value: g.id, label: g.code })),
            },
            {
              name: "skuId",
              label: "All SKUs",
              value: query.skuId,
              options: skus.map((s) => ({ value: s.id, label: s.code })),
            },
            {
              name: "movementType",
              label: "All movement types",
              value: query.movementType,
              options: MOVEMENT_TYPES.map((t) => ({ value: t, label: humanize(t) })),
            },
          ]}
        />
        {entries.length >= REPORT_ROW_LIMIT && (
          <Alert tone="info" className="m-4">
            Showing the first {REPORT_ROW_LIMIT.toLocaleString("en-IN")} entries. Narrow the period for a complete view.
          </Alert>
        )}
        {entries.length > 0 ? (
          <LedgerTable entries={entries} />
        ) : (
          <EmptyState icon={ScrollText} title="No movements in this period" />
        )}
      </Card>
    </>
  );
}
