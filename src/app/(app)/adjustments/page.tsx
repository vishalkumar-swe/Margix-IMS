import { Plus, SlidersHorizontal } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { FilterBar } from "@/components/shared/filter-bar";
import { StatusBadge } from "@/components/shared/status-badge";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/ui/pagination";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { formatDateTime } from "@/lib/dates";
import { humanize } from "@/lib/format";
import { can } from "@/lib/permissions";
import { parseSearchParams } from "@/lib/search-params";
import { ADJUSTMENT_REASON_LABELS, ADJUSTMENT_STATUSES, adjustmentListQuerySchema } from "@/lib/validation/adjustments";
import { requirePagePermission } from "@/server/auth/current-user";
import { listAdjustments } from "@/server/modules/adjustments/adjustments.queries";

export const metadata: Metadata = { title: "Adjustments" };

export default async function AdjustmentsPage({ searchParams }: PageProps<"/adjustments">) {
  const user = await requirePagePermission("adjustment.view");
  const raw = await searchParams;
  const query = parseSearchParams(adjustmentListQuerySchema, raw);
  const { items, total } = await listAdjustments(query);
  const newButton = can(user.role, "adjustment.request") && (
    <Link href="/adjustments/new" className={buttonVariants()}>
      <Plus aria-hidden /> Request adjustment
    </Link>
  );

  return (
    <>
      <PageHeader
        title="Adjustments"
        description="Corrections for damage, theft, expiry and counting errors — each approved by a second person."
        actions={newButton}
      />
      <Card>
        <FilterBar
          search={{ name: "q", placeholder: "Adjustment number", value: query.q }}
          selects={[
            {
              name: "status",
              label: "All statuses",
              value: query.status,
              options: ADJUSTMENT_STATUSES.map((s) => ({ value: s, label: humanize(s) })),
            },
          ]}
        />
        {items.length > 0 ? (
          <>
            <Table>
              <THead>
                <tr>
                  <TH>Adjustment</TH>
                  <TH>Godown</TH>
                  <TH>Reason</TH>
                  <TH numeric>Lines</TH>
                  <TH>Requested</TH>
                  <TH>Reviewed</TH>
                  <TH>Status</TH>
                </tr>
              </THead>
              <TBody>
                {items.map((adj) => (
                  <TR key={adj.id}>
                    <TD>
                      <Link href={`/adjustments/${adj.id}`} className="font-mono text-xs font-medium text-brand-700 hover:underline">
                        {adj.adjustmentNumber}
                      </Link>
                    </TD>
                    <TD>{adj.godown.code}</TD>
                    <TD>
                      {ADJUSTMENT_REASON_LABELS[adj.reasonCode]}
                      {adj.reasonNote && <span className="block max-w-56 truncate text-xs text-slate-500">{adj.reasonNote}</span>}
                    </TD>
                    <TD numeric>{adj._count.items}</TD>
                    <TD className="text-xs">
                      {adj.submittedBy.name}
                      <span className="block text-slate-500">{formatDateTime(adj.submittedAt)}</span>
                    </TD>
                    <TD className="text-xs">
                      {adj.reviewedBy ? (
                        <>
                          {adj.reviewedBy.name}
                          <span className="block text-slate-500">{formatDateTime(adj.reviewedAt)}</span>
                        </>
                      ) : (
                        "—"
                      )}
                    </TD>
                    <TD>
                      <StatusBadge status={adj.status} />
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
            <Pagination page={query.page} pageSize={query.pageSize} total={total} pathname="/adjustments" searchParams={raw} />
          </>
        ) : (
          <EmptyState icon={SlidersHorizontal} title="No adjustments found" action={newButton || undefined} />
        )}
      </Card>
    </>
  );
}
