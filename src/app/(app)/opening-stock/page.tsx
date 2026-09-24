import { ClipboardCheck, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { formatDate, formatDateTime } from "@/lib/dates";
import { requirePagePermission } from "@/server/auth/current-user";
import { listOpeningBalances } from "@/server/modules/opening/opening.queries";

export const metadata: Metadata = { title: "Opening stock" };

export default async function OpeningStockPage() {
  await requirePagePermission("opening.post");
  const openings = await listOpeningBalances();
  const newButton = (
    <Link href="/opening-stock/new" className={buttonVariants()}>
      <Plus aria-hidden /> Post opening stock
    </Link>
  );

  return (
    <>
      <PageHeader
        title="Opening stock"
        description="Go-live balances. Each line is posted as an OPENING entry in the ledger."
        actions={newButton}
      />
      <Card>
        {openings.length > 0 ? (
          <Table>
            <THead>
              <tr>
                <TH>Document</TH>
                <TH>Godown</TH>
                <TH>As of</TH>
                <TH numeric>Lines</TH>
                <TH>Posted</TH>
                <TH>Status</TH>
              </tr>
            </THead>
            <TBody>
              {openings.map((o) => (
                <TR key={o.id}>
                  <TD>
                    <Link
                      href={`/ledger?referenceNo=${encodeURIComponent(o.openingNumber)}`}
                      className="font-mono text-xs font-medium text-brand-700 hover:underline"
                    >
                      {o.openingNumber}
                    </Link>
                    {o.remarks && <span className="block text-xs text-slate-500">{o.remarks}</span>}
                  </TD>
                  <TD>{o.godown.name}</TD>
                  <TD className="text-xs">{formatDate(o.asOf)}</TD>
                  <TD numeric>{o._count.items}</TD>
                  <TD className="text-xs">
                    {o.createdBy.name}
                    <span className="block text-slate-500">{formatDateTime(o.createdAt)}</span>
                  </TD>
                  <TD>
                    <StatusBadge status={o.status} />
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        ) : (
          <EmptyState icon={ClipboardCheck} title="No opening stock posted" action={newButton} />
        )}
      </Card>
    </>
  );
}
