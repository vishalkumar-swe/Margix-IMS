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

  const details = [
    `From ${dispatch.godown.name}`,
    dispatch.customer ? `to ${dispatch.customer.name}` : "internal issue",
    formatDateTime(dispatch.dispatchedAt),
    `by ${dispatch.createdBy.name}`,
    dispatch.referenceNo && `ref ${dispatch.referenceNo}`,
    dispatch.vehicleNo && `vehicle ${dispatch.vehicleNo}`,
  ].filter(Boolean);

  return (
    <>
      <PageHeader
        back={{ href: "/dispatches", label: "Dispatches" }}
        title={dispatch.outwardNumber}
        meta={<StatusBadge status={dispatch.status} />}
        description={details.join(" · ")}
      />
      {dispatch.remarks && <p className="-mt-3 mb-6 text-sm text-slate-600">{dispatch.remarks}</p>}
      <Card>
        <CardHeader title="Ledger entries" description="One OUTWARD entry per dispatched batch." />
        <LedgerTable entries={entries} canReverse={can(user.role, "ledger.reverse")} />
      </Card>
    </>
  );
}
