import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { Card, CardHeader } from "@/components/ui/card";
import { LedgerTable } from "@/features/ledger/ledger-table";
import { formatDateTime } from "@/lib/dates";
import { can } from "@/lib/permissions";
import { idSchema } from "@/lib/validation/common";
import { requirePagePermission } from "@/server/auth/current-user";
import { listEntriesForDocument } from "@/server/modules/inventory/ledger.queries";
import { getTransferDetail } from "@/server/modules/transfers/transfer.queries";

export const metadata: Metadata = { title: "Transfer" };

export default async function TransferPage({ params }: PageProps<"/transfers/[id]">) {
  const user = await requirePagePermission("transfer.view");
  const { id } = await params;
  if (!idSchema.safeParse(id).success) notFound();

  const transfer = await getTransferDetail(id);
  if (!transfer) notFound();
  const entries = await listEntriesForDocument(transfer.id);

  return (
    <>
      <PageHeader
        back={{ href: "/transfers", label: "Transfers" }}
        title={transfer.transferNumber}
        meta={<StatusBadge status={transfer.status} />}
        description={`${transfer.fromGodown.name} → ${transfer.toGodown.name} · ${formatDateTime(transfer.transferredAt)} by ${transfer.createdBy.name}`}
      />
      {transfer.remarks && <p className="-mt-3 mb-6 text-sm text-slate-600">{transfer.remarks}</p>}
      <Card>
        <CardHeader
          title="Ledger entries"
          description="Each line moves stock out of the source and into the destination. Reversing either leg reverses both."
        />
        <LedgerTable entries={entries} canReverse={can(user.role, "ledger.reverse")} />
      </Card>
    </>
  );
}
