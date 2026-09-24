import type { Metadata } from "next";
import Link from "next/link";
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
import { getPurchaseReturnDetail } from "@/server/modules/returns/returns.queries";

export const metadata: Metadata = { title: "Supplier return" };

export default async function PurchaseReturnPage({ params }: PageProps<"/purchase-returns/[id]">) {
  const user = await requirePagePermission("return.view");
  const { id } = await params;
  if (!idSchema.safeParse(id).success) notFound();

  const purchaseReturn = await getPurchaseReturnDetail(id);
  if (!purchaseReturn) notFound();
  const entries = await listEntriesForDocument(purchaseReturn.id);

  return (
    <>
      <PageHeader
        back={{ href: "/purchase-returns", label: "Supplier returns" }}
        title={purchaseReturn.returnNumber}
        meta={<StatusBadge status={purchaseReturn.status} />}
        description={
          <>
            Against{" "}
            <Link href={`/grns/${purchaseReturn.grn.id}`} className="text-brand-700 hover:underline">
              {purchaseReturn.grn.grnNumber}
            </Link>{" "}
            · {purchaseReturn.supplier.name} · from {purchaseReturn.godown.name} ·{" "}
            {formatDateTime(purchaseReturn.returnedAt)} by {purchaseReturn.createdBy.name}
          </>
        }
      />
      <p className="-mt-3 mb-6 text-sm text-slate-600">
        Reason: {purchaseReturn.reason}
        {purchaseReturn.remarks && <> — {purchaseReturn.remarks}</>}
      </p>
      <Card>
        <CardHeader title="Ledger entries" />
        <LedgerTable entries={entries} canReverse={can(user.role, "ledger.reverse")} />
      </Card>
    </>
  );
}
