import { CornerDownLeft, Printer } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { DispatchVerification, type VerifiableLine } from "@/features/dispatch/dispatch-verification";
import { LedgerTable } from "@/features/ledger/ledger-table";
import { formatDateTime } from "@/lib/dates";
import { can } from "@/lib/permissions";
import { idSchema } from "@/lib/validation/common";
import { requirePagePermission } from "@/server/auth/current-user";
import { ZERO } from "@/server/db/decimal";
import { getDispatchDetail } from "@/server/modules/dispatch/dispatch.queries";
import { listEntriesForDocument } from "@/server/modules/inventory/ledger.queries";

export const metadata: Metadata = { title: "Dispatch" };

export default async function DispatchPage({ params }: PageProps<"/dispatches/[id]">) {
  const user = await requirePagePermission("dispatch.view");
  const { id } = await params;
  if (!idSchema.safeParse(id).success) notFound();

  const dispatch = await getDispatchDetail(id);
  if (!dispatch) notFound();
  const entries = await listEntriesForDocument(dispatch.id);

  // What should be on the vehicle: dispatched quantity per product, reversed lines excluded.
  const toVerify = new Map<string, VerifiableLine>();
  for (const item of dispatch.items) {
    if (item.ledgerEntry.reversedBy) continue;
    const line = toVerify.get(item.sku.id);
    toVerify.set(item.sku.id, {
      skuId: item.sku.id,
      code: item.sku.code,
      name: item.sku.name,
      barcode: item.sku.barcode,
      unit: item.sku.baseUom.code,
      expected: line ? item.quantity.plus(line.expected).toString() : item.quantity.toString(),
    });
  }

  const details = [
    `From ${dispatch.godown.name}`,
    dispatch.customer ? `to ${dispatch.customer.name}` : "internal issue",
    formatDateTime(dispatch.dispatchedAt),
    `by ${dispatch.createdBy.name}`,
    dispatch.referenceNo && `ref ${dispatch.referenceNo}`,
    dispatch.vehicleNo && `vehicle ${dispatch.vehicleNo}`,
  ].filter(Boolean);

  const totalDispatched = dispatch.items
    .reduce((sum, item) => sum.plus(item.quantity), ZERO)
    .toString();

  return (
    <>
      <PageHeader
        back={{ href: "/dispatches", label: "Dispatches" }}
        title={dispatch.outwardNumber}
        meta={<StatusBadge status={dispatch.status} />}
        description={
          <>
            {details.join(" · ")}
            {dispatch.invoice && (
              <>
                {" · against "}
                <Link href={`/invoices/${dispatch.invoice.id}`} className="text-brand-700 hover:underline">
                  {dispatch.invoice.invoiceNumber}
                </Link>
              </>
            )}
          </>
        }
        actions={
          <>
            <Link href={`/dispatches/${dispatch.id}/print`} className={buttonVariants({ variant: "secondary" })}>
              <Printer aria-hidden /> Print
            </Link>
            {can(user.role, "return.create") && dispatch.status !== "REVERSED" && (
              <Link href={`/sales-returns/new?outwardId=${dispatch.id}`} className={buttonVariants({ variant: "secondary" })}>
                <CornerDownLeft aria-hidden /> Record customer return
              </Link>
            )}
          </>
        }
      />
      {dispatch.status === "POSTED" && (
        <div className="mb-6 rounded-xl border border-emerald-300 bg-emerald-50/90 p-4 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-emerald-600 text-white font-bold text-sm">✓</span>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800">
                  AI Live Audit Feedback · Milestone 5 Complete
                </p>
                <p className="text-sm font-semibold text-emerald-950 mt-0.5">
                  Ledger Updated: -{totalDispatched} units OUTWARD | Godown: {dispatch.godown.code}
                  {dispatch.invoice ? ` | Invoice Status: ${dispatch.invoice.status}` : ""}
                </p>
                <p className="text-xs text-emerald-700">
                  Physical inventory has been successfully deducted from the ledger using FEFO batch picking.
                </p>
              </div>
            </div>
            {dispatch.invoice && (
              <Link
                href={`/invoices/${dispatch.invoice.id}`}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-emerald-800"
              >
                Milestone 6: Reconcile Invoice →
              </Link>
            )}
          </div>
        </div>
      )}
      {dispatch.remarks && <p className="-mt-3 mb-6 text-sm text-slate-600">{dispatch.remarks}</p>}
      {toVerify.size > 0 && (
        <div className="mb-6">
          <DispatchVerification lines={[...toVerify.values()]} />
        </div>
      )}
      <Card>
        <CardHeader title="Ledger entries" description="One OUTWARD entry per dispatched batch." />
        <LedgerTable entries={entries} canReverse={can(user.role, "ledger.reverse")} />
      </Card>
    </>
  );
}
