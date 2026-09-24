import { Package } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { FilterBar } from "@/components/shared/filter-bar";
import { StatusBadge } from "@/components/shared/status-badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/ui/pagination";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { EMPTY_SKU, SkuFormDialog } from "@/features/masters/sku-form-dialog";
import { humanize } from "@/lib/format";
import { can } from "@/lib/permissions";
import { parseSearchParams } from "@/lib/search-params";
import { SKU_STATUSES, skuListQuerySchema } from "@/lib/validation/masters";
import { requirePagePermission } from "@/server/auth/current-user";
import { listCategories, listSkus, listUoms } from "@/server/modules/masters/masters.queries";

export const metadata: Metadata = { title: "Products (SKUs)" };

export default async function SkusPage({ searchParams }: PageProps<"/masters/skus">) {
  const user = await requirePagePermission("master.view");
  const raw = await searchParams;
  const query = parseSearchParams(skuListQuerySchema, raw);
  const canManage = can(user.role, "master.manage");
  const [{ items, total }, categories, uoms] = await Promise.all([
    listSkus(query),
    canManage ? listCategories({ activeOnly: true }) : Promise.resolve([]),
    canManage ? listUoms() : Promise.resolve([]),
  ]);

  return (
    <>
      <PageHeader
        title="Products (SKUs)"
        description="Items tracked in inventory. SKUs are archived, never deleted, so history stays intact."
        actions={canManage && <SkuFormDialog initial={EMPTY_SKU} categories={categories} uoms={uoms} />}
      />
      <Card>
        <FilterBar
          search={{ name: "q", placeholder: "Code or name", value: query.q }}
          selects={[
            {
              name: "status",
              label: "All statuses",
              value: query.status,
              options: SKU_STATUSES.map((s) => ({ value: s, label: humanize(s) })),
            },
          ]}
        />
        {items.length > 0 ? (
          <>
            <Table>
              <THead>
                <tr>
                  <TH>Code</TH>
                  <TH>Name</TH>
                  <TH>Category</TH>
                  <TH>Unit</TH>
                  <TH>Batches</TH>
                  <TH>HSN / GST</TH>
                  <TH>Tally item</TH>
                  <TH>Status</TH>
                  {canManage && <TH className="sr-only">Actions</TH>}
                </tr>
              </THead>
              <TBody>
                {items.map((sku) => (
                  <TR key={sku.id}>
                    <TD>
                      <Link href={`/stock/${sku.id}`} className="font-mono text-xs font-medium text-brand-700 hover:underline">
                        {sku.code}
                      </Link>
                    </TD>
                    <TD>{sku.name}</TD>
                    <TD>{sku.category?.name ?? "—"}</TD>
                    <TD>{sku.baseUom.code}</TD>
                    <TD className="text-xs">{sku.isBatchTracked ? "Tracked" : "Not tracked"}</TD>
                    <TD className="text-xs">
                      {sku.hsnCode ?? "—"}
                      {sku.gstRate && <span className="block text-slate-500">{sku.gstRate.toString()}%</span>}
                    </TD>
                    <TD className="text-xs">
                      {sku.tallyStockItemName ?? <span className="text-amber-700">Not mapped</span>}
                    </TD>
                    <TD>
                      <StatusBadge status={sku.status} />
                    </TD>
                    {canManage && (
                      <TD className="text-right">
                        <SkuFormDialog
                          skuId={sku.id}
                          categories={categories}
                          uoms={uoms}
                          initial={{
                            code: sku.code,
                            name: sku.name,
                            description: sku.description ?? "",
                            categoryId: sku.categoryId ?? "",
                            baseUomId: sku.baseUomId,
                            hsnCode: sku.hsnCode ?? "",
                            gstRate: sku.gstRate?.toString() ?? "",
                            isBatchTracked: sku.isBatchTracked,
                            tallyStockItemName: sku.tallyStockItemName ?? "",
                            status: sku.status,
                          }}
                        />
                      </TD>
                    )}
                  </TR>
                ))}
              </TBody>
            </Table>
            <Pagination page={query.page} pageSize={query.pageSize} total={total} pathname="/masters/skus" searchParams={raw} />
          </>
        ) : (
          <EmptyState icon={Package} title="No SKUs found" />
        )}
      </Card>
    </>
  );
}
