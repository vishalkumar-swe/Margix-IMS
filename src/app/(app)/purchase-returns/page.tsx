import { CornerUpRight } from "lucide-react";
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
import { listPurchaseReturns } from "@/server/modules/returns/returns.queries";

export const metadata: Metadata = { title: "Supplier returns" };

export default async function PurchaseReturnsPage({ searchParams }: PageProps<"/purchase-returns">) {
  const user = await requirePagePermission("return.view");
  const raw = await searchParams;
  const query = parseSearchParams(returnListQuerySchema, raw);
  const { items, total } = await listPurchaseReturns(query);

  return (
    <>
      <PageHeader
        title="Supplier returns"
        description="Goods sent back to suppliers, always against the goods receipt they came in on."
        actions={
          can(user.role, "return.create") && (
            <Link href="/purchase-returns/new" className={buttonVariants()}>
              <CornerUpRight aria-hidden /> Return to supplier
            </Link>
          )
        }
      />
      <Card>
        <FilterBar search={{ name: "q", placeholder: "Return, GRN or supplier", value: query.q }} />
        {items.length > 0 ? (
          <>
            <Table>
              <THead>
                <tr>
                  <TH>Return</TH>
                  <TH>Date</TH>
                  <TH>GRN</TH>
                  <TH>Supplier</TH>
                  <TH>From</TH>
                  <TH>Reason</TH>
                  <TH>Status</TH>
                </tr>
              </THead>
              <TBody>
                {items.map((r) => (
                  <TR key={r.id}>
                    <TD>
                      <Link href={`/purchase-returns/${r.id}`} className="font-mono text-xs font-medium text-brand-700 hover:underline">
                        {r.returnNumber}
                      </Link>
                    </TD>
                    <TD className="text-xs">{formatDateTime(r.returnedAt)}</TD>
                    <TD>
                      <Link href={`/grns/${r.grn.id}`} className="font-mono text-xs hover:underline">
                        {r.grn.grnNumber}
                      </Link>
                    </TD>
                    <TD>{r.supplier.name}</TD>
                    <TD>{r.godown.code}</TD>
                    <TD className="max-w-56 truncate text-xs">{r.reason}</TD>
                    <TD>
                      <StatusBadge status={r.status} />
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
            <Pagination page={query.page} pageSize={query.pageSize} total={total} pathname="/purchase-returns" searchParams={raw} />
          </>
        ) : (
          <EmptyState
            icon={CornerUpRight}
            title="No supplier returns"
            description="Open a goods receipt and choose “Return to supplier”."
          />
        )}
      </Card>
    </>
  );
}
