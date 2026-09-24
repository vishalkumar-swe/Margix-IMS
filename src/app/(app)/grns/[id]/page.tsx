import { CornerUpRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { Quantity } from "@/components/shared/quantity";
import { StatusBadge } from "@/components/shared/status-badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { LedgerTable } from "@/features/ledger/ledger-table";
import { formatDate, formatDateTime } from "@/lib/dates";
import { can } from "@/lib/permissions";
import { idSchema } from "@/lib/validation/common";
import { requirePagePermission } from "@/server/auth/current-user";
import { listEntriesForDocument } from "@/server/modules/inventory/ledger.queries";
import { getGrnDetail } from "@/server/modules/purchasing/purchasing.queries";

export const metadata: Metadata = { title: "Goods receipt" };

export default async function GrnPage({ params }: PageProps<"/grns/[id]">) {
  const user = await requirePagePermission("grn.view");
  const { id } = await params;
  if (!idSchema.safeParse(id).success) notFound();

  const grn = await getGrnDetail(id);
  if (!grn) notFound();
  const entries = await listEntriesForDocument(grn.id);

  return (
    <>
      <PageHeader
        back={{ href: "/grns", label: "Goods receipts" }}
        title={grn.grnNumber}
        meta={<StatusBadge status={grn.status} />}
        description={
          <>
            Against{" "}
            <Link href={`/purchase-orders/${grn.purchaseOrder.id}`} className="text-brand-700 hover:underline">
              {grn.purchaseOrder.poNumber}
            </Link>{" "}
            · {grn.purchaseOrder.supplier.name} · into {grn.godown.name} · {formatDateTime(grn.receivedAt)} by{" "}
            {grn.createdBy.name}
            {grn.supplierInvoiceNo && <> · supplier invoice {grn.supplierInvoiceNo}</>}
          </>
        }
        actions={
          can(user.role, "return.create") &&
          grn.status !== "REVERSED" &&
          grn.items.some((item) => item.acceptedQty.greaterThan(item.returnedQty)) && (
            <Link href={`/purchase-returns/new?grnId=${grn.id}`} className={buttonVariants({ variant: "secondary" })}>
              <CornerUpRight aria-hidden /> Return to supplier
            </Link>
          )
        }
      />

      <Card>
        <CardHeader title="Lines" />
        <Table>
          <THead>
            <tr>
              <TH>SKU</TH>
              <TH>Batch</TH>
              <TH>Expiry</TH>
              <TH numeric>Received</TH>
              <TH numeric>Accepted</TH>
              <TH numeric>Rejected</TH>
              <TH numeric>Returned</TH>
              <TH>Rejection reason</TH>
            </tr>
          </THead>
          <TBody>
            {grn.items.map((item) => (
              <TR key={item.id}>
                <TD>
                  <span className="font-medium text-slate-900">{item.sku.code}</span>
                  <span className="block text-xs text-slate-500">{item.sku.name}</span>
                </TD>
                <TD className="font-mono text-xs">{item.batch.batchNumber}</TD>
                <TD className="text-xs">{formatDate(item.batch.expiryDate)}</TD>
                <TD numeric>
                  <Quantity value={item.receivedQty} unit={item.sku.baseUom.code} />
                </TD>
                <TD numeric>
                  <Quantity value={item.acceptedQty} />
                </TD>
                <TD numeric>
                  <Quantity value={item.rejectedQty} className={item.rejectedQty.greaterThan(0) ? "text-red-700" : undefined} />
                </TD>
                <TD numeric>
                  <Quantity value={item.returnedQty} />
                </TD>
                <TD className="text-xs">{item.rejectionReason ?? "—"}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>

      <Card className="mt-6">
        <CardHeader title="Ledger entries" description="Stock movements posted by this receipt." />
        <LedgerTable entries={entries} canReverse={can(user.role, "ledger.reverse")} />
      </Card>
    </>
  );
}
