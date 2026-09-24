import {
  ArrowDownRight,
  ArrowUpRight,
  BellRing,
  Boxes,
  ClipboardList,
  Package,
  RefreshCw,
  SlidersHorizontal,
  TriangleAlert,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { Quantity } from "@/components/shared/quantity";
import { Alert } from "@/components/ui/alert";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { StatCard } from "@/components/ui/stat-card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { LedgerTable } from "@/features/ledger/ledger-table";
import { formatDate } from "@/lib/dates";
import { requirePagePermission } from "@/server/auth/current-user";
import { getDashboardSummary } from "@/server/modules/dashboard/dashboard.queries";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage({ searchParams }: PageProps<"/">) {
  await requirePagePermission("dashboard.view");
  const [summary, { denied }] = await Promise.all([getDashboardSummary(), searchParams]);

  return (
    <>
      <PageHeader title="Dashboard" description="Live position derived from the inventory ledger." />

      {denied && (
        <Alert tone="error" className="mb-6">
          You do not have permission to open that page.
        </Alert>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Active SKUs" value={summary.activeSkus} icon={Package} href="/masters/skus" />
        <StatCard label="Stock lines" value={summary.stockLines} icon={Boxes} href="/stock" hint="SKU × godown × batch" />
        <StatCard label="Inward today" value={summary.inwardToday} icon={ArrowDownRight} href="/grns" />
        <StatCard label="Outward today" value={summary.outwardToday} icon={ArrowUpRight} href="/dispatches" />
        <StatCard
          label="Pending approvals"
          value={summary.pendingAdjustments}
          icon={SlidersHorizontal}
          href="/adjustments?status=SUBMITTED"
          tone={summary.pendingAdjustments > 0 ? "warning" : "neutral"}
        />
        <StatCard
          label="Open purchase orders"
          value={summary.openPurchaseOrders}
          icon={ClipboardList}
          href="/purchase-orders?status=OPEN"
        />
        <StatCard
          label="Tally sync failed"
          value={summary.tally.FAILED}
          icon={TriangleAlert}
          href="/tally?status=FAILED"
          tone={summary.tally.FAILED > 0 ? "danger" : "neutral"}
        />
        <StatCard
          label="Tally sync pending"
          value={summary.tally.PENDING + summary.tally.IN_PROGRESS}
          icon={RefreshCw}
          href="/tally?status=PENDING"
        />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader
            title="Recent movements"
            actions={
              <Link href="/ledger" className="text-sm font-medium text-brand-700 hover:underline">
                View ledger
              </Link>
            }
          />
          {summary.recentMovements.length > 0 ? (
            <LedgerTable entries={summary.recentMovements} />
          ) : (
            <EmptyState icon={Boxes} title="No stock movements yet" />
          )}
        </Card>

        <div className="space-y-6">
          <NeedsAttention exceptions={summary.exceptions} failedSync={summary.tally.FAILED} pendingAdjustments={summary.pendingAdjustments} />

          <Card>
            <CardHeader title="Expiring within 30 days" />
            {summary.expiringBatches.length > 0 ? (
              <Table>
                <THead>
                  <tr>
                    <TH>SKU / batch</TH>
                    <TH>Expiry</TH>
                    <TH numeric>Qty</TH>
                  </tr>
                </THead>
                <TBody>
                  {summary.expiringBatches.map((row) => (
                    <TR key={`${row.sku.id}-${row.godown.code}-${row.batch.batchNumber}`}>
                      <TD>
                        <Link href={`/stock/${row.sku.id}`} className="font-medium hover:underline">
                          {row.sku.code}
                        </Link>
                        <span className="block text-xs text-slate-500">
                          {row.batch.batchNumber} · {row.godown.code}
                        </span>
                      </TD>
                      <TD className="text-xs">{formatDate(row.batch.expiryDate)}</TD>
                      <TD numeric>
                        <Quantity value={row.quantity} unit={row.sku.baseUom.code} />
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            ) : (
              <CardBody className="text-sm text-slate-500">No batches are close to expiry.</CardBody>
            )}
          </Card>

          <Card>
            <CardHeader title="Stock lines by godown" />
            <CardBody>
              {summary.godowns.length > 0 ? (
                <ul className="space-y-2 text-sm">
                  {summary.godowns.map(({ godown, stockLines }) => (
                    <li key={godown.id} className="flex items-center justify-between">
                      <Link href={`/stock?godownId=${godown.id}`} className="hover:underline">
                        {godown.name} <span className="text-slate-400">({godown.code})</span>
                      </Link>
                      <span className="tabular-nums text-slate-700">{stockLines}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-slate-500">No stock on hand.</p>
              )}
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}

/** Exceptions as first-class items (spec §6.8), each linking to where it is resolved. */
function NeedsAttention({
  exceptions,
  failedSync,
  pendingAdjustments,
}: {
  exceptions: { lowStock: number; invoicesAwaitingDispatch: number; unmappedSkus: number; unmappedGodowns: number };
  failedSync: number;
  pendingAdjustments: number;
}) {
  const items = [
    { count: exceptions.lowStock, label: "SKUs below reorder level", href: "/alerts", tone: "danger" },
    { count: failedSync, label: "Tally syncs failed", href: "/tally?status=FAILED", tone: "danger" },
    { count: pendingAdjustments, label: "Adjustments awaiting approval", href: "/adjustments?status=SUBMITTED", tone: "warning" },
    { count: exceptions.invoicesAwaitingDispatch, label: "Invoices awaiting dispatch", href: "/invoices", tone: "warning" },
    { count: exceptions.unmappedSkus, label: "Active SKUs without Tally mapping", href: "/masters/skus", tone: "warning" },
    { count: exceptions.unmappedGodowns, label: "Godowns without Tally mapping", href: "/masters/godowns", tone: "warning" },
  ].filter((item) => item.count > 0);

  return (
    <Card>
      <CardHeader title="Needs attention" />
      {items.length > 0 ? (
        <ul className="divide-y divide-slate-100">
          {items.map((item) => (
            <li key={item.label}>
              <Link href={item.href} className="flex items-center justify-between px-5 py-3 text-sm hover:bg-slate-50">
                <span className="flex items-center gap-2 text-slate-700">
                  <BellRing className={item.tone === "danger" ? "size-4 text-red-500" : "size-4 text-amber-500"} aria-hidden />
                  {item.label}
                </span>
                <span className="font-semibold tabular-nums text-slate-900">{item.count}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <CardBody className="text-sm text-slate-500">Nothing needs attention.</CardBody>
      )}
    </Card>
  );
}
