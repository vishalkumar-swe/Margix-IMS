import { Boxes } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { Quantity } from "@/components/shared/quantity";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/ui/pagination";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { FilterBar } from "@/components/shared/filter-bar";
import { formatDate } from "@/lib/dates";
import { parseSearchParams } from "@/lib/search-params";
import { stockListQuerySchema } from "@/lib/validation/stock";
import { can } from "@/lib/permissions";
import { requirePagePermission } from "@/server/auth/current-user";
import { listStockBalances } from "@/server/modules/inventory/stock.queries";
import { listGodowns } from "@/server/modules/masters/masters.queries";

export const metadata: Metadata = { title: "Stock" };

export default async function StockPage({ searchParams }: PageProps<"/stock">) {
  const user = await requirePagePermission("stock.view");
  const canAdjust = can(user.role, "adjustment.request");
  const raw = await searchParams;
  const query = parseSearchParams(stockListQuerySchema, raw);
  const [{ items, total }, godowns] = await Promise.all([listStockBalances(query), listGodowns()]);

  return (
    <>
      <PageHeader
        title="Stock"
        description="Current stock by SKU, godown and batch. Stock changes only through documents: Adjust and Write off raise an adjustment request that another user approves."
      />
      <Card>
        <FilterBar
          search={{ name: "q", placeholder: "SKU code, name or batch", value: query.q }}
          selects={[
            {
              name: "godownId",
              label: "All godowns",
              value: query.godownId,
              options: godowns.map((g) => ({ value: g.id, label: `${g.code} · ${g.name}` })),
            },
          ]}
          checkbox={{ name: "includeZero", label: "Show zero balances", checked: query.includeZero }}
        />
        {items.length > 0 ? (
          <>
            <Table>
              <THead>
                <tr>
                  <TH>SKU</TH>
                  <TH>Godown</TH>
                  <TH>Batch</TH>
                  <TH>Expiry</TH>
                  <TH numeric>Quantity</TH>
                  <TH className="sr-only">Actions</TH>
                </tr>
              </THead>
              <TBody>
                {items.map((row) => (
                  <TR key={`${row.sku.id}-${row.godown.id}-${row.batch.id}`}>
                    <TD>
                      <Link href={`/stock/${row.sku.id}`} className="font-medium text-slate-900 hover:underline">
                        {row.sku.code}
                      </Link>
                      <span className="block text-xs text-slate-500">{row.sku.name}</span>
                    </TD>
                    <TD>{row.godown.name}</TD>
                    <TD className="font-mono text-xs">{row.batch.batchNumber}</TD>
                    <TD className="text-xs">{formatDate(row.batch.expiryDate)}</TD>
                    <TD numeric>
                      <Quantity value={row.quantity} unit={row.sku.baseUom.code} />
                    </TD>
                    <TD className="text-right text-xs whitespace-nowrap">
                      {(() => {
                        const key = `skuId=${row.sku.id}&godownId=${row.godown.id}&batchId=${row.batch.id}`;
                        return (
                          <span className="inline-flex gap-3">
                            <Link href={`/ledger?${key}`} className="text-brand-700 hover:underline">
                              Movements
                            </Link>
                            {canAdjust && (
                              <>
                                <Link href={`/adjustments/new?${key}`} className="text-brand-700 hover:underline">
                                  Adjust
                                </Link>
                                <Link
                                  href={`/adjustments/new?${key}&direction=decrease&quantity=${row.quantity.toString()}`}
                                  className="text-red-700 hover:underline"
                                >
                                  Write off
                                </Link>
                              </>
                            )}
                          </span>
                        );
                      })()}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
            <Pagination page={query.page} pageSize={query.pageSize} total={total} pathname="/stock" searchParams={raw} />
          </>
        ) : (
          <EmptyState icon={Boxes} title="No stock found" description="Adjust the filters or post a goods receipt." />
        )}
      </Card>
    </>
  );
}
