import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { Quantity } from "@/components/shared/quantity";
import { StatusBadge } from "@/components/shared/status-badge";
import { Card, CardHeader } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { LedgerTable } from "@/features/ledger/ledger-table";
import { formatDate } from "@/lib/dates";
import { can } from "@/lib/permissions";
import { idSchema } from "@/lib/validation/common";
import { requirePagePermission } from "@/server/auth/current-user";
import { listLedgerEntries } from "@/server/modules/inventory/ledger.queries";
import { getSkuStock } from "@/server/modules/inventory/stock.queries";
import { getSku } from "@/server/modules/masters/masters.queries";

export const metadata: Metadata = { title: "SKU stock" };

export default async function SkuStockPage({ params }: PageProps<"/stock/[skuId]">) {
  const user = await requirePagePermission("stock.view");
  const { skuId } = await params;
  if (!idSchema.safeParse(skuId).success) notFound();

  const sku = await getSku(skuId);
  if (!sku) notFound();
  const [stock, ledger] = await Promise.all([getSkuStock(skuId), listLedgerEntries({ skuId, limit: 50 })]);
  const unit = sku.baseUom.code;

  return (
    <>
      <PageHeader
        back={{ href: "/stock", label: "Stock" }}
        title={`${sku.code} · ${sku.name}`}
        meta={<StatusBadge status={sku.status} />}
        description={
          <>
            Total on hand: <Quantity value={stock.total} unit={unit} className="font-semibold text-slate-900" />
            {sku.category && <> · {sku.category.name}</>}
            {!sku.isBatchTracked && <> · not batch-tracked</>}
          </>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="By godown" />
          <Table>
            <THead>
              <tr>
                <TH>Godown</TH>
                <TH numeric>Quantity</TH>
              </tr>
            </THead>
            <TBody>
              {stock.byGodown.map(({ godown, quantity }) => (
                <TR key={godown.id}>
                  <TD>
                    {godown.name} <span className="text-slate-400">({godown.code})</span>
                  </TD>
                  <TD numeric>
                    <Quantity value={quantity} unit={unit} />
                  </TD>
                </TR>
              ))}
              {stock.byGodown.length === 0 && (
                <TR>
                  <TD colSpan={2} className="text-slate-500">
                    No stock on hand.
                  </TD>
                </TR>
              )}
            </TBody>
          </Table>
        </Card>

        <Card>
          <CardHeader title="By batch" />
          <Table>
            <THead>
              <tr>
                <TH>Batch</TH>
                <TH>Godown</TH>
                <TH>Expiry</TH>
                <TH numeric>Quantity</TH>
              </tr>
            </THead>
            <TBody>
              {stock.byBatch.map((row) => (
                <TR key={`${row.godown.id}-${row.batch.id}`}>
                  <TD className="font-mono text-xs">{row.batch.batchNumber}</TD>
                  <TD>{row.godown.code}</TD>
                  <TD className="text-xs">{formatDate(row.batch.expiryDate)}</TD>
                  <TD numeric>
                    <Quantity value={row.quantity} unit={unit} />
                  </TD>
                </TR>
              ))}
              {stock.byBatch.length === 0 && (
                <TR>
                  <TD colSpan={4} className="text-slate-500">
                    No stock on hand.
                  </TD>
                </TR>
              )}
            </TBody>
          </Table>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader title="Movement history" description="Latest 50 ledger entries for this SKU." />
        <LedgerTable entries={ledger.items} showSku={false} canReverse={can(user.role, "ledger.reverse")} />
      </Card>
    </>
  );
}
