import { CornerDownLeft } from "lucide-react";
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
import { returnListQuerySchema } from "@/lib/validation/returns";
import { requirePagePermission } from "@/server/auth/current-user";
import { listSalesReturns } from "@/server/modules/returns/returns.queries";

export const metadata: Metadata = { title: "Customer returns" };

export default async function SalesReturnsPage({ searchParams }: PageProps<"/sales-returns">) {
  const user = await requirePagePermission("return.view");
  const raw = await searchParams;
  const query = parseSearchParams(returnListQuerySchema, raw);
  const { items, total } = await listSalesReturns(query);

  return (
    <>
      <PageHeader
        title="Customer returns"
        description="Goods coming back from customers, always against the dispatch they went out on."
        actions={
          can(user.role, "return.create") && (
            <Link href="/sales-returns/new" className={buttonVariants()}>
              <CornerDownLeft aria-hidden /> Record return
            </Link>
          )
        }
      />
      <Card>
        <FilterBar search={{ name: "q", placeholder: "Return, dispatch or customer", value: query.q }} />
        {items.length > 0 ? (
          <>
            <Table>
              <THead>
                <tr>
                  <TH>Return</TH>
                  <TH>Date</TH>
                  <TH>Dispatch</TH>
                  <TH>Customer</TH>
                  <TH>Into</TH>
                  <TH>Reason</TH>
                  <TH>Status</TH>
                </tr>
              </THead>
              <TBody>
                {items.map((r) => (
                  <TR key={r.id}>
                    <TD>
                      <Link href={`/sales-returns/${r.id}`} className="font-mono text-xs font-medium text-brand-700 hover:underline">
                        {r.returnNumber}
                      </Link>
                    </TD>
                    <TD className="text-xs">{formatDateTime(r.returnedAt)}</TD>
                    <TD>
                      <Link href={`/dispatches/${r.outward.id}`} className="font-mono text-xs hover:underline">
                        {r.outward.outwardNumber}
                      </Link>
                    </TD>
                    <TD>{r.customer?.name ?? "—"}</TD>
                    <TD>{r.godown.code}</TD>
                    <TD className="max-w-56 truncate text-xs">{r.reason}</TD>
                    <TD>
                      <StatusBadge status={r.status} />
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
            <Pagination page={query.page} pageSize={query.pageSize} total={total} pathname="/sales-returns" searchParams={raw} />
          </>
        ) : (
          <EmptyState
            icon={CornerDownLeft}
            title="No customer returns"
            description="Open a dispatch and choose “Record customer return”."
          />
        )}
      </Card>
    </>
  );
}
