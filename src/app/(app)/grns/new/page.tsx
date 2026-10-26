import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { Alert } from "@/components/ui/alert";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { StatusBadge } from "@/components/shared/status-badge";
import { ReceiveGoodsForm } from "@/features/purchasing/receive-goods-form";
import { formatDate } from "@/lib/dates";
import { toNamedOption, toSkuOption } from "@/lib/options";
import { requirePagePermission } from "@/server/auth/current-user";
import { listGodowns } from "@/server/modules/masters/masters.queries";
import { getPurchaseOrderDetail, listPurchaseOrders } from "@/server/modules/purchasing/purchasing.queries";

export const metadata: Metadata = { title: "Receive Goods (GRN)" };

export default async function NewGrnPage({
  searchParams,
}: {
  searchParams: Promise<{ poId?: string }>;
}) {
  await requirePagePermission("grn.create");
  const { poId } = await searchParams;

  if (!poId) {
    const { items } = await listPurchaseOrders({ page: 1, pageSize: 20, status: "OPEN" });
    if (items.length === 1 && items[0]) {
      redirect(`/grns/new?poId=${items[0].id}`);
    }

    return (
      <>
        <PageHeader
          back={{ href: "/grns", label: "Goods receipts" }}
          title="Receive goods via GRN"
          description="Select an open purchase order to receive goods into a warehouse godown."
        />
        <Card>
          <CardHeader title="Open purchase orders awaiting receipt" />
          {items.length > 0 ? (
            <Table>
              <THead>
                <tr>
                  <TH>PO Number</TH>
                  <TH>Supplier</TH>
                  <TH>Order date</TH>
                  <TH>Status</TH>
                  <TH className="text-right">Action</TH>
                </tr>
              </THead>
              <TBody>
                {items.map((po) => (
                  <TR key={po.id}>
                    <TD className="font-mono text-xs font-medium text-brand-700">
                      <Link href={`/grns/new?poId=${po.id}`} className="hover:underline">
                        {po.poNumber}
                      </Link>
                    </TD>
                    <TD>{po.supplier.name}</TD>
                    <TD className="text-xs">{formatDate(po.orderDate)}</TD>
                    <TD>
                      <StatusBadge status={po.status} />
                    </TD>
                    <TD className="text-right">
                      <Link
                        href={`/grns/new?poId=${po.id}`}
                        className="rounded bg-brand-500 px-2.5 py-1 text-xs font-medium text-black hover:bg-brand-400"
                      >
                        Receive goods
                      </Link>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          ) : (
            <CardBody className="space-y-3 text-sm text-slate-500">
              <p>There are no open purchase orders awaiting receipt.</p>
              <div>
                <Link href="/purchase-orders/new" className="text-brand-700 font-medium hover:underline">
                  Create a purchase order first →
                </Link>
              </div>
            </CardBody>
          )}
        </Card>
      </>
    );
  }

  const po = await getPurchaseOrderDetail(poId);
  if (!po) notFound();

  const receivable = po.status === "OPEN" || po.status === "PARTIALLY_RECEIVED";
  const pendingLines = po.items
    .map((item) => ({ item, pending: item.orderedQty.minus(item.receivedQty) }))
    .filter(({ pending }) => pending.greaterThan(0));
  const godowns = receivable ? await listGodowns({ activeOnly: true }) : [];

  return (
    <>
      <PageHeader
        back={{ href: `/purchase-orders/${po.id}`, label: po.poNumber }}
        title={`Receive goods: ${po.poNumber}`}
        description={`${po.supplier.name} · ordered ${formatDate(po.orderDate)}`}
        meta={<StatusBadge status={po.status} />}
      />

      {!receivable ? (
        <Alert tone="error">
          This purchase order has status {po.status} and cannot receive goods.
        </Alert>
      ) : pendingLines.length === 0 ? (
        <Alert tone="info">
          All items on this purchase order have already been fully received.
        </Alert>
      ) : (
        <ReceiveGoodsForm
          purchaseOrderId={po.id}
          godowns={godowns.map(toNamedOption)}
          lines={pendingLines.map(({ item, pending }) => ({
            purchaseOrderItemId: item.id,
            sku: toSkuOption(item.sku),
            ordered: item.orderedQty.toString(),
            received: item.receivedQty.toString(),
            pending: pending.toString(),
          }))}
        />
      )}
    </>
  );
}
