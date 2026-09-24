import { Hourglass } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { CsvDownloadLink } from "@/components/shared/csv-download-link";
import { FilterBar } from "@/components/shared/filter-bar";
import { Quantity } from "@/components/shared/quantity";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { formatDateTime } from "@/lib/dates";
import { toQueryString } from "@/lib/search-params";
import type { StockAgingRow } from "@/server/modules/reports/reports.queries";

/** Slow and dead stock share one layout; only the idle threshold differs. */
export function StockAgingReport({
  kind,
  minDays,
  rows,
  godownId,
  godowns,
}: {
  kind: "slow" | "dead";
  minDays: number;
  rows: StockAgingRow[];
  godownId?: string;
  godowns: { id: string; code: string; name: string }[];
}) {
  const title = kind === "slow" ? "Slow stock" : "Dead stock";
  return (
    <>
      <PageHeader
        back={{ href: "/reports", label: "Reports" }}
        title={title}
        description={`Stock on hand with no movement for ${minDays} days or more, oldest first.`}
        actions={
          <CsvDownloadLink href={`/api/v1/reports/stock-aging${toQueryString({ kind, godownId, format: "csv" })}`} />
        }
      />
      <Card>
        <FilterBar
          selects={[
            {
              name: "godownId",
              label: "All godowns",
              value: godownId,
              options: godowns.map((g) => ({ value: g.id, label: `${g.code} · ${g.name}` })),
            },
          ]}
        />
        {rows.length > 0 ? (
          <Table>
            <THead>
              <tr>
                <TH>SKU</TH>
                <TH>Godown</TH>
                <TH numeric>Quantity</TH>
                <TH>Last movement</TH>
                <TH numeric>Days idle</TH>
              </tr>
            </THead>
            <TBody>
              {rows.map((row) => (
                <TR key={`${row.skuId}-${row.godownCode}`}>
                  <TD>
                    <Link href={`/stock/${row.skuId}`} className="font-medium hover:underline">
                      {row.skuCode}
                    </Link>
                    <span className="block text-xs text-slate-500">{row.skuName}</span>
                  </TD>
                  <TD>{row.godownName}</TD>
                  <TD numeric>
                    <Quantity value={row.quantity} unit={row.unit} />
                  </TD>
                  <TD className="text-xs">{formatDateTime(row.lastMovementAt)}</TD>
                  <TD numeric className="font-medium text-amber-700">
                    {row.daysIdle}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        ) : (
          <EmptyState icon={Hourglass} title={`No ${title.toLowerCase()}`} description="All stock has moved recently." />
        )}
      </Card>
    </>
  );
}
