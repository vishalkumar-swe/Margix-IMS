import { Plus, Truck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { FilterBar } from "@/components/shared/filter-bar";
import { ProductFilterNotice } from "@/components/shared/product-filter-notice";
import { StatusBadge } from "@/components/shared/status-badge";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/ui/pagination";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { formatDateTime } from "@/lib/dates";
import { can } from "@/lib/permissions";
import { parseSearchParams } from "@/lib/search-params";
import { dispatchListQuerySchema } from "@/lib/validation/dispatch";
import { requirePagePermission } from "@/server/auth/current-user";
import { listDispatches } from "@/server/modules/dispatch/dispatch.queries";
import { getSku, listGodowns } from "@/server/modules/masters/masters.queries";

export const metadata: Metadata = { title: "Dispatches" };

export default async function DispatchesPage({ searchParams }: PageProps<"/dispatches">) {
  const user = await requirePagePermission("dispatch.view");
  const raw = await searchParams;
  const query = parseSearchParams(dispatchListQuerySchema, raw);
  const [{ items, total }, godowns, sku] = await Promise.all([
    listDispatches(query),
    listGodowns(),
    query.skuId ? getSku(query.skuId) : null,
  ]);
  const newButton = can(user.role, "dispatch.create") && (
    <Link href="/dispatches/new" className={buttonVariants()}>
      <Plus aria-hidden /> New dispatch
    </Link>
  );

  return (
    <>
      <PageHeader title="Dispatches" description="Outward movements of stock, batch by batch." actions={newButton} />
      <Card>
        <ProductFilterNotice sku={sku} clearHref="/dispatches" />
        <FilterBar
          hidden={{ skuId: query.skuId }}
          search={{ name: "q", placeholder: "Dispatch no., reference or customer", value: query.q }}
          selects={[
            {
              name: "godownId",
              label: "All godowns",
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
                  <TH>Dispatch</TH>
                  <TH>Date</TH>
                  <TH>From</TH>
                  <TH>Customer</TH>
                  <TH>Reference</TH>
                  <TH numeric>Lines</TH>
                  <TH>Status</TH>
                </tr>
              </THead>
              <TBody>
                {items.map((d) => (
                  <TR key={d.id}>
                    <TD>
                      <Link href={`/dispatches/${d.id}`} className="font-mono text-xs font-medium text-brand-700 hover:underline">
                        {d.outwardNumber}
                      </Link>
                    </TD>
                    <TD className="text-xs">{formatDateTime(d.dispatchedAt)}</TD>
                    <TD>{d.godown.code}</TD>
                    <TD>{d.customer?.name ?? <span className="text-slate-400">Internal</span>}</TD>
                    <TD className="text-xs">{d.referenceNo ?? "—"}</TD>
                    <TD numeric>{d._count.items}</TD>
                    <TD>
                      <StatusBadge status={d.status} />
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
            <Pagination page={query.page} pageSize={query.pageSize} total={total} pathname="/dispatches" searchParams={raw} />
          </>
        ) : (
          <EmptyState icon={Truck} title="No dispatches found" action={newButton || undefined} />
        )}
      </Card>
    </>
  );
}
