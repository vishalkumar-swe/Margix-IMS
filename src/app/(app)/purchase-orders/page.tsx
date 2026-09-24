import { ClipboardList, Plus } from "lucide-react";
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
import { formatDate } from "@/lib/dates";
import { humanize } from "@/lib/format";
import { can } from "@/lib/permissions";
import { parseSearchParams } from "@/lib/search-params";
import { PO_STATUSES, poListQuerySchema } from "@/lib/validation/purchasing";
import { requirePagePermission } from "@/server/auth/current-user";
import { getSku } from "@/server/modules/masters/masters.queries";
import { listPurchaseOrders } from "@/server/modules/purchasing/purchasing.queries";

export const metadata: Metadata = { title: "Purchase orders" };

export default async function PurchaseOrdersPage({ searchParams }: PageProps<"/purchase-orders">) {
  const user = await requirePagePermission("po.view");
  const raw = await searchParams;
  const query = parseSearchParams(poListQuerySchema, raw);
  const [{ items, total }, sku] = await Promise.all([listPurchaseOrders(query), query.skuId ? getSku(query.skuId) : null]);
  const newButton = can(user.role, "po.manage") && (
    <Link href="/purchase-orders/new" className={buttonVariants()}>
      <Plus aria-hidden /> New purchase order
    </Link>
  );

  return (
    <>
      <PageHeader title="Purchase orders" description="Orders placed with suppliers and their receipt progress." actions={newButton} />
      <Card>
        <ProductFilterNotice sku={sku} clearHref="/purchase-orders" />
        <FilterBar
          hidden={{ skuId: query.skuId }}
          search={{ name: "q", placeholder: "PO number or supplier", value: query.q }}
          selects={[
            {
              name: "status",
              label: "All statuses",
              value: query.status,
              options: PO_STATUSES.map((s) => ({ value: s, label: humanize(s) })),
            },
          ]}
        />
        {items.length > 0 ? (
          <>
            <Table>
              <THead>
                <tr>
                  <TH>PO number</TH>
                  <TH>Supplier</TH>
                  <TH>Order date</TH>
                  <TH>Expected</TH>
                  <TH numeric>Lines</TH>
                  <TH numeric>GRNs</TH>
                  <TH>Status</TH>
                </tr>
              </THead>
              <TBody>
                {items.map((po) => (
                  <TR key={po.id}>
                    <TD>
                      <Link href={`/purchase-orders/${po.id}`} className="font-mono text-xs font-medium text-brand-700 hover:underline">
                        {po.poNumber}
                      </Link>
                    </TD>
                    <TD>{po.supplier.name}</TD>
                    <TD className="text-xs">{formatDate(po.orderDate)}</TD>
                    <TD className="text-xs">{formatDate(po.expectedDate)}</TD>
                    <TD numeric>{po._count.items}</TD>
                    <TD numeric>{po._count.grns}</TD>
                    <TD>
                      <StatusBadge status={po.status} />
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
            <Pagination page={query.page} pageSize={query.pageSize} total={total} pathname="/purchase-orders" searchParams={raw} />
          </>
        ) : (
          <EmptyState icon={ClipboardList} title="No purchase orders found" action={newButton || undefined} />
        )}
      </Card>
    </>
  );
}
