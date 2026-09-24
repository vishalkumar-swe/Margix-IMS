import { PackageCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { FilterBar } from "@/components/shared/filter-bar";
import { ProductFilterNotice } from "@/components/shared/product-filter-notice";
import { StatusBadge } from "@/components/shared/status-badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/ui/pagination";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { formatDateTime } from "@/lib/dates";
import { parseSearchParams } from "@/lib/search-params";
import { grnListQuerySchema } from "@/lib/validation/purchasing";
import { requirePagePermission } from "@/server/auth/current-user";
import { getSku } from "@/server/modules/masters/masters.queries";
import { listGrns } from "@/server/modules/purchasing/purchasing.queries";

export const metadata: Metadata = { title: "Goods receipts" };

export default async function GrnsPage({ searchParams }: PageProps<"/grns">) {
  await requirePagePermission("grn.view");
  const raw = await searchParams;
  const query = parseSearchParams(grnListQuerySchema, raw);
  const [{ items, total }, sku] = await Promise.all([listGrns(query), query.skuId ? getSku(query.skuId) : null]);

  return (
    <>
      <PageHeader
        title="Goods receipts"
        description="GRNs are posted from an open purchase order. Only accepted quantity enters stock."
      />
      <Card>
        <ProductFilterNotice sku={sku} clearHref="/grns" />
        <FilterBar hidden={{ skuId: query.skuId }} search={{ name: "q", placeholder: "GRN or PO number", value: query.q }} />
        {items.length > 0 ? (
          <>
            <Table>
              <THead>
                <tr>
                  <TH>GRN</TH>
                  <TH>Purchase order</TH>
                  <TH>Supplier</TH>
                  <TH>Godown</TH>
                  <TH>Received</TH>
                  <TH numeric>Lines</TH>
                  <TH>Status</TH>
                </tr>
              </THead>
              <TBody>
                {items.map((grn) => (
                  <TR key={grn.id}>
                    <TD>
                      <Link href={`/grns/${grn.id}`} className="font-mono text-xs font-medium text-brand-700 hover:underline">
                        {grn.grnNumber}
                      </Link>
                    </TD>
                    <TD>
                      <Link href={`/purchase-orders/${grn.purchaseOrder.id}`} className="font-mono text-xs hover:underline">
                        {grn.purchaseOrder.poNumber}
                      </Link>
                    </TD>
                    <TD>{grn.purchaseOrder.supplier.name}</TD>
                    <TD>{grn.godown.code}</TD>
                    <TD className="text-xs">{formatDateTime(grn.receivedAt)}</TD>
                    <TD numeric>{grn._count.items}</TD>
                    <TD>
                      <StatusBadge status={grn.status} />
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
            <Pagination page={query.page} pageSize={query.pageSize} total={total} pathname="/grns" searchParams={raw} />
          </>
        ) : (
          <EmptyState
            icon={PackageCheck}
            title="No goods receipts yet"
            description="Open a purchase order to receive goods against it."
          />
        )}
      </Card>
    </>
  );
}
