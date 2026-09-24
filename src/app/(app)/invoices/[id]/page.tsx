import { Truck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { Quantity } from "@/components/shared/quantity";
import { ReasonActionButton } from "@/components/shared/reason-action-button";
import { StatusBadge } from "@/components/shared/status-badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { formatDate, formatDateTime } from "@/lib/dates";
import { can } from "@/lib/permissions";
import { idSchema } from "@/lib/validation/common";
import { requirePagePermission } from "@/server/auth/current-user";
import { getInvoiceDetail } from "@/server/modules/invoices/invoice.queries";

export const metadata: Metadata = { title: "Invoice" };

export default async function InvoicePage({ params }: PageProps<"/invoices/[id]">) {
  const user = await requirePagePermission("invoice.view");
  const { id } = await params;
  if (!idSchema.safeParse(id).success) notFound();

  const invoice = await getInvoiceDetail(id);
  if (!invoice) notFound();

  const dispatchable = invoice.status === "OPEN" || invoice.status === "PARTIALLY_DISPATCHED";
  const nothingDispatched = invoice.items.every((item) => item.dispatchedQty.isZero());

  return (
    <>
      <PageHeader
        back={{ href: "/invoices", label: "Invoices" }}
        title={invoice.invoiceNumber}
        meta={<StatusBadge status={invoice.status} />}
        description={`${invoice.customer.name} · ${formatDate(invoice.invoiceDate)} · created by ${invoice.createdBy.name}`}
        actions={
          <>
            {invoice.status === "OPEN" && nothingDispatched && can(user.role, "invoice.manage") && (
              <ReasonActionButton
                endpoint={`/invoices/${invoice.id}/cancel`}
                label="Cancel invoice"
                title={`Cancel ${invoice.invoiceNumber}`}
                confirmLabel="Cancel invoice"
              />
            )}
            {dispatchable && can(user.role, "dispatch.create") && (
              <Link href={`/dispatches/new?invoiceId=${invoice.id}`} className={buttonVariants()}>
                <Truck aria-hidden /> Dispatch against invoice
              </Link>
            )}
          </>
        }
      />

      {invoice.status === "CANCELLED" && (
        <Card className="mb-6 border-slate-300 bg-slate-50">
          <CardBody className="text-sm text-slate-700">
            Cancelled {formatDateTime(invoice.cancelledAt)} by {invoice.cancelledBy?.name}: {invoice.cancelReason}
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader title="Items" description={invoice.remarks ?? undefined} />
        <Table>
          <THead>
            <tr>
              <TH>#</TH>
              <TH>SKU</TH>
              <TH numeric>Invoiced</TH>
              <TH numeric>Dispatched</TH>
              <TH numeric>Remaining</TH>
              <TH numeric>Rate (₹)</TH>
              <TH numeric>GST %</TH>
            </tr>
          </THead>
          <TBody>
            {invoice.items.map((item) => {
              const remaining = item.quantity.minus(item.dispatchedQty);
              return (
                <TR key={item.id}>
                  <TD className="text-xs text-slate-500">{item.lineNo}</TD>
                  <TD>
                    <Link href={`/stock/${item.sku.id}`} className="font-medium hover:underline">
                      {item.sku.code}
                    </Link>
                    <span className="block text-xs text-slate-500">{item.sku.name}</span>
                  </TD>
                  <TD numeric>
                    <Quantity value={item.quantity} unit={item.sku.baseUom.code} />
                    {item.entryUom && item.entryQuantity && (
                      <span className="block text-xs text-slate-500">
                        entered as {item.entryQuantity.toString()} {item.entryUom.code}
                      </span>
                    )}
                  </TD>
                  <TD numeric>
                    <Quantity value={item.dispatchedQty} />
                  </TD>
                  <TD numeric>
                    <Quantity value={remaining} className={remaining.greaterThan(0) ? "font-medium text-amber-700" : undefined} />
                  </TD>
                  <TD numeric>
                    {item.rate ? `${item.rate.toFixed(2)} / ${item.entryUom?.code ?? item.sku.baseUom.code}` : "—"}
                  </TD>
                  <TD numeric>{item.gstRate?.toString() ?? "—"}</TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      </Card>

      <Card className="mt-6">
        <CardHeader title="Dispatches" />
        {invoice.outwards.length > 0 ? (
          <Table>
            <THead>
              <tr>
                <TH>Dispatch</TH>
                <TH>Date</TH>
                <TH>From</TH>
                <TH>By</TH>
                <TH>Status</TH>
              </tr>
            </THead>
            <TBody>
              {invoice.outwards.map((outward) => (
                <TR key={outward.id}>
                  <TD>
                    <Link href={`/dispatches/${outward.id}`} className="font-mono text-xs font-medium text-brand-700 hover:underline">
                      {outward.outwardNumber}
                    </Link>
                  </TD>
                  <TD className="text-xs">{formatDateTime(outward.dispatchedAt)}</TD>
                  <TD>{outward.godown.name}</TD>
                  <TD className="text-xs">{outward.createdBy.name}</TD>
                  <TD>
                    <StatusBadge status={outward.status} />
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        ) : (
          <CardBody className="text-sm text-slate-500">Nothing dispatched yet.</CardBody>
        )}
      </Card>
    </>
  );
}
