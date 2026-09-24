import { Package, Tags } from "lucide-react";
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
import { SkuImportDialog } from "@/features/imports/import-dialogs";
import { GenerateBarcodesButton } from "@/features/masters/generate-barcodes-button";
import { EMPTY_SKU, SkuFormDialog } from "@/features/masters/sku-form-dialog";
import { SkuUnitsDialog } from "@/features/masters/sku-units-dialog";
import { humanize } from "@/lib/format";
import { can } from "@/lib/permissions";
import { parseSearchParams } from "@/lib/search-params";
import { SKU_STATUSES, skuListQuerySchema } from "@/lib/validation/masters";
import { requirePagePermission } from "@/server/auth/current-user";
import { listCategories, listSkus, listUoms } from "@/server/modules/masters/masters.queries";
import { previewNextCode } from "@/server/modules/numbering/numbering.service";

export const metadata: Metadata = { title: "Products (SKUs)" };

export default async function SkusPage({ searchParams }: PageProps<"/masters/skus">) {
  const user = await requirePagePermission("master.view");
  const raw = await searchParams;
  const query = parseSearchParams(skuListQuerySchema, raw);
  const canManage = can(user.role, "master.manage");
  const [{ items, total }, categories, uoms, nextCode] = await Promise.all([
    listSkus(query),
    canManage ? listCategories({ activeOnly: true }) : Promise.resolve([]),
    canManage ? listUoms() : Promise.resolve([]),
    canManage ? previewNextCode("SKU") : Promise.resolve(undefined),
  ]);

  const categoryOptions = categories.map((c) => ({ id: c.id, name: c.name }));

  return (
    <>
      <PageHeader
        title="Products (SKUs)"
        description="Items tracked in inventory. SKUs are archived, never deleted, so history stays intact."
        actions={
          <>
            <Link href="/masters/skus/labels" className={buttonVariants({ variant: "secondary" })}>
              <Tags aria-hidden /> Print labels
            </Link>
            {canManage && (
              <>
                <GenerateBarcodesButton />
                <SkuImportDialog />
                <SkuFormDialog initial={EMPTY_SKU} categories={categoryOptions} uoms={uoms} nextCode={nextCode} />
              </>
            )}
          </>
        }
      />
      <Card>
        <FilterBar
          search={{ name: "q", placeholder: "Code, name or barcode", value: query.q }}
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
                  <TH>Barcode</TH>
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
                    <TD>
                      {sku.baseUom.code}
                      {sku.units.map((u) => (
                        <span key={u.uomId} className="block text-xs text-slate-500">
                          {u.uom.code} = {u.factor.toString()}
                        </span>
                      ))}
                    </TD>
                    <TD className="text-xs">{sku.isBatchTracked ? "Tracked" : "Not tracked"}</TD>
                    <TD className="text-xs">
                      {sku.hsnCode ?? "—"}
                      {sku.gstRate && <span className="block text-slate-500">{sku.gstRate.toString()}%</span>}
                    </TD>
                    <TD className="text-xs">
                      {sku.barcode ? (
                        <Link
                          href={`/masters/skus/${sku.id}/label`}
                          className="font-mono text-brand-700 hover:underline"
                          title="Print label"
                        >
                          {sku.barcode}
                        </Link>
                      ) : (
                        <span className="text-amber-700">None</span>
                      )}
                    </TD>
                    <TD className="text-xs">
                      {sku.tallyStockItemName ?? <span className="text-amber-700">Not mapped</span>}
                    </TD>
                    <TD>
                      <StatusBadge status={sku.status} />
                    </TD>
                    {canManage && (
                      <TD className="text-right whitespace-nowrap">
                        <SkuUnitsDialog
                          skuId={sku.id}
                          skuCode={sku.code}
                          baseUom={{ id: sku.baseUomId, code: sku.baseUom.code }}
                          units={sku.units.map((u) => ({ uomId: u.uomId, code: u.uom.code, factor: u.factor.toString() }))}
                          uoms={uoms}
                        />
                        <SkuFormDialog
                          skuId={sku.id}
                          categories={categoryOptions}
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
                            barcode: sku.barcode ?? "",
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
