import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { Quantity } from "@/components/shared/quantity";
import { StatusBadge } from "@/components/shared/status-badge";
import { Alert } from "@/components/ui/alert";
import { Card, CardHeader } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { AdjustmentReview } from "@/features/adjustments/adjustment-review";
import { LedgerTable } from "@/features/ledger/ledger-table";
import { formatDateTime } from "@/lib/dates";
import { formatEntryNo } from "@/lib/format";
import { can } from "@/lib/permissions";
import { ADJUSTMENT_REASON_LABELS } from "@/lib/validation/adjustments";
import { idSchema } from "@/lib/validation/common";
import { requirePagePermission } from "@/server/auth/current-user";
import { getAdjustmentDetail } from "@/server/modules/adjustments/adjustments.queries";
import { listEntriesForDocument } from "@/server/modules/inventory/ledger.queries";

export const metadata: Metadata = { title: "Adjustment" };

export default async function AdjustmentPage({ params }: PageProps<"/adjustments/[id]">) {
  const user = await requirePagePermission("adjustment.view");
  const { id } = await params;
  if (!idSchema.safeParse(id).success) notFound();

  const adjustment = await getAdjustmentDetail(id);
  if (!adjustment) notFound();
  const entries = adjustment.status === "SUBMITTED" ? [] : await listEntriesForDocument(adjustment.id);

  const pending = adjustment.status === "SUBMITTED";
  const isSubmitter = adjustment.submittedById === user.id;
  const canReview = pending && can(user.role, "adjustment.approve") && !isSubmitter;

  return (
    <>
      <PageHeader
        back={{ href: "/adjustments", label: "Adjustments" }}
        title={adjustment.adjustmentNumber}
        meta={<StatusBadge status={adjustment.status} />}
        description={`${ADJUSTMENT_REASON_LABELS[adjustment.reasonCode]} · ${adjustment.godown.name} · requested by ${adjustment.submittedBy.name}, ${formatDateTime(adjustment.submittedAt)}`}
      />

      {adjustment.reasonNote && <p className="-mt-3 mb-6 text-sm text-slate-600">“{adjustment.reasonNote}”</p>}

      {adjustment.reviewedBy && (
        <Alert tone={adjustment.status === "REJECTED" ? "error" : "success"} className="mb-6">
          {adjustment.status === "REJECTED" ? "Rejected" : "Approved"} by {adjustment.reviewedBy.name},{" "}
          {formatDateTime(adjustment.reviewedAt)}
          {adjustment.reviewNote && <>: {adjustment.reviewNote}</>}
        </Alert>
      )}
      {pending && isSubmitter && (
        <Alert tone="info" className="mb-6">
          Awaiting review. You submitted this request, so another authorised user must approve or reject it.
        </Alert>
      )}

      <Card>
        <CardHeader title="Lines" />
        <Table>
          <THead>
            <tr>
              <TH>SKU</TH>
              <TH>Batch</TH>
              <TH numeric>Change</TH>
              <TH>Ledger entry</TH>
            </tr>
          </THead>
          <TBody>
            {adjustment.items.map((item) => (
              <TR key={item.id}>
                <TD>
                  <Link href={`/stock/${item.sku.id}`} className="font-medium hover:underline">
                    {item.sku.code}
                  </Link>
                  <span className="block text-xs text-slate-500">{item.sku.name}</span>
                </TD>
                <TD className="font-mono text-xs">{item.batch.batchNumber}</TD>
                <TD numeric>
                  <Quantity value={item.quantity} unit={item.sku.baseUom.code} signed />
                </TD>
                <TD className="font-mono text-xs">
                  {item.ledgerEntry ? formatEntryNo(item.ledgerEntry.entryNo) : "Not posted"}
                  {item.ledgerEntry?.reversedBy && (
                    <span className="block text-red-600">reversed by {formatEntryNo(item.ledgerEntry.reversedBy.entryNo)}</span>
                  )}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>

      {canReview && (
        <div className="mt-6">
          <AdjustmentReview adjustmentId={adjustment.id} />
        </div>
      )}

      {entries.length > 0 && (
        <Card className="mt-6">
          <CardHeader title="Ledger entries" />
          <LedgerTable entries={entries} canReverse={can(user.role, "ledger.reverse")} />
        </Card>
      )}
    </>
  );
}
