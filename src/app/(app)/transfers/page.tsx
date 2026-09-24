import { ArrowLeftRight, Plus } from "lucide-react";
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
import { can } from "@/lib/permissions";
import { parseSearchParams } from "@/lib/search-params";
import { transferListQuerySchema } from "@/lib/validation/transfers";
import { requirePagePermission } from "@/server/auth/current-user";
import { listGodowns } from "@/server/modules/masters/masters.queries";
import { listTransfers } from "@/server/modules/transfers/transfer.queries";

export const metadata: Metadata = { title: "Transfers" };

export default async function TransfersPage({ searchParams }: PageProps<"/transfers">) {
  const user = await requirePagePermission("transfer.view");
  const raw = await searchParams;
  const query = parseSearchParams(transferListQuerySchema, raw);
  const [{ items, total }, godowns] = await Promise.all([listTransfers(query), listGodowns()]);
  const newButton = can(user.role, "transfer.create") && (
    <Link href="/transfers/new" className={buttonVariants()}>
      <Plus aria-hidden /> New transfer
    </Link>
  );

  return (
    <>
      <PageHeader title="Transfers" description="Stock moved between godowns." actions={newButton} />
      <Card>
        <FilterBar
          search={{ name: "q", placeholder: "Transfer number", value: query.q }}
          selects={[
            {
              name: "godownId",
              label: "Any godown",
              value: query.godownId,
              options: godowns.map((g) => ({ value: g.id, label: `${g.code} · ${g.name}` })),
            },
          ]}
        />
        {items.length > 0 ? (
          <>
            <Table>
              <THead>
                <tr>
                  <TH>Transfer</TH>
                  <TH>Date</TH>
                  <TH>From</TH>
                  <TH>To</TH>
                  <TH numeric>Lines</TH>
                  <TH>By</TH>
                  <TH>Status</TH>
                </tr>
              </THead>
              <TBody>
                {items.map((t) => (
                  <TR key={t.id}>
                    <TD>
                      <Link href={`/transfers/${t.id}`} className="font-mono text-xs font-medium text-brand-700 hover:underline">
                        {t.transferNumber}
                      </Link>
                    </TD>
                    <TD className="text-xs">{formatDateTime(t.transferredAt)}</TD>
                    <TD>{t.fromGodown.name}</TD>
                    <TD>{t.toGodown.name}</TD>
                    <TD numeric>{t._count.items}</TD>
                    <TD className="text-xs">{t.createdBy.name}</TD>
                    <TD>
                      <StatusBadge status={t.status} />
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
            <Pagination page={query.page} pageSize={query.pageSize} total={total} pathname="/transfers" searchParams={raw} />
          </>
        ) : (
          <EmptyState icon={ArrowLeftRight} title="No transfers found" action={newButton || undefined} />
        )}
      </Card>
    </>
  );
}
