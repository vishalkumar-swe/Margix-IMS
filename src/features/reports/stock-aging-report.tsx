import { ChevronDown, Hourglass, Settings2 } from "lucide-react";
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
  canReorder,
  canConfigure,
}: {
  kind: "slow" | "dead";
  minDays: number;
  rows: StockAgingRow[];
  godownId?: string;
  godowns: { id: string; code: string; name: string }[];
  /** May create purchase orders (shows "Create reorder"). */
  canReorder: boolean;
  /** May change the slow / dead stock days. */
  canConfigure: boolean;
}) {
  const title = kind === "slow" ? "Slow stock" : "Dead stock";
  return (
    <>
      <PageHeader
        back={{ href: "/reports", label: "Reports" }}
        title={title}
        description={`Stock on hand with no movement for ${minDays} days or more, oldest first.${
          kind === "slow" ? " A daily scan raises slow-moving alerts and notifications for these items." : ""
        }`}
        actions={
          <>
            {canConfigure && (
              <Link href="/admin/notifications#stock-aging" className="inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:underline">
                <Settings2 className="size-4" aria-hidden /> Change days
              </Link>
            )}
            <CsvDownloadLink href={`/api/v1/reports/stock-aging${toQueryString({ kind, godownId, format: "csv" })}`} />
          </>
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
                <TH className="sr-only">Actions</TH>
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
                  <TD className="text-right">
                    <RowActions row={row} canReorder={canReorder} />
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

/** Where to go from an idle item: the product, its stock, its sales and purchase history, a reorder. */
function RowActions({ row, canReorder }: { row: StockAgingRow; canReorder: boolean }) {
  const sku = encodeURIComponent(row.skuId);
  const links = [
    { href: `/masters/skus?q=${encodeURIComponent(row.skuCode)}`, label: "View product" },
    { href: `/stock/${sku}`, label: "View stock" },
    { href: `/dispatches?skuId=${sku}`, label: "Sales history: dispatches" },
    { href: `/invoices?skuId=${sku}`, label: "Sales history: invoices" },
    { href: `/purchase-orders?skuId=${sku}`, label: "Purchase history: orders" },
    { href: `/grns?skuId=${sku}`, label: "Purchase history: receipts" },
    ...(canReorder ? [{ href: `/purchase-orders/new?skuId=${sku}`, label: "Create reorder" }] : []),
  ];
  // Opens in place (not a floating menu): the table wrapper scrolls, which would clip an overlay.
  return (
    <details className="group inline-block text-left">
      <summary className="inline-flex cursor-pointer list-none items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 [&::-webkit-details-marker]:hidden">
        Actions <ChevronDown className="size-3.5 transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <ul className="surface-solid mt-1 w-56 rounded-md border py-1 shadow-lg">
        {links.map((link) => (
          <li key={link.href}>
            <Link href={link.href} className="block px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50">
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </details>
  );
}
