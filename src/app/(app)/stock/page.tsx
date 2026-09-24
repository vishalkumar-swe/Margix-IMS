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
import { requirePagePermission } from "@/server/auth/current-user";
import { listStockBalances } from "@/server/modules/inventory/stock.queries";
import { listGodowns } from "@/server/modules/masters/masters.queries";

export const metadata: Metadata = { title: "Stock" };

export default async function StockPage({ searchParams }: PageProps<"/stock">) {
  await requirePagePermission("stock.view");
  const raw = await searchParams;
  const query = parseSearchParams(stockListQuerySchema, raw);
  const [{ items, total }, godowns] = await Promise.all([listStockBalances(query), listGodowns()]);

  return (
    <>
      <PageHeader title="Stock" description="Current stock by SKU, godown and batch." />
      <Card>
        <FilterBar
          search={{ name: "q", placeholder: "Search SKU code or name", value: query.q }}
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
