import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { Quantity } from "@/components/shared/quantity";
import { StatusBadge } from "@/components/shared/status-badge";
import { Alert } from "@/components/ui/alert";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { PurchaseOrderActions } from "@/features/purchasing/purchase-order-actions";
import { ReceiveGoodsForm } from "@/features/purchasing/receive-goods-form";
import { formatDate, formatDateTime } from "@/lib/dates";
import { toNamedOption, toSkuOption } from "@/lib/options";
import { can } from "@/lib/permissions";
import { idSchema } from "@/lib/validation/common";
import { requirePagePermission } from "@/server/auth/current-user";
import { listGodowns } from "@/server/modules/masters/masters.queries";
import { getPurchaseOrderDetail } from "@/server/modules/purchasing/purchasing.queries";

export const metadata: Metadata = { title: "Purchase order" };

/** A GRN number as issued by the document sequence (confirmation banner input). */
const GRN_NUMBER = /^GRN-\d{4}-\d{5}$/;

export default async function PurchaseOrderPage({ params, searchParams }: PageProps<"/purchase-orders/[id]">) {
  const user = await requirePagePermission("po.view");
  const { id } = await params;
  const { posted } = await searchParams;
  const postedGrn = typeof posted === "string" && GRN_NUMBER.test(posted) ? posted : null;
  if (!idSchema.safeParse(id).success) notFound();

  const po = await getPurchaseOrderDetail(id);
  if (!po) notFound();

  const canManage = can(user.role, "po.manage");
  const hasReceipts = po.items.some((item) => item.receivedQty.greaterThan(0));
  const receivable = po.status === "OPEN" || po.status === "PARTIALLY_RECEIVED";
  const pendingLines = po.items
    .map((item) => ({ item, pending: item.orderedQty.minus(item.receivedQty) }))
    .filter(({ pending }) => pending.greaterThan(0));
  const godowns = receivable && can(user.role, "grn.create") ? await listGodowns({ activeOnly: true }) : [];

  return (
    <>
      <PageHeader
        back={{ href: "/purchase-orders", label: "Purchase orders" }}
        title={po.poNumber}
        meta={<StatusBadge status={po.status} />}
        description={`${po.supplier.name} · ordered ${formatDate(po.orderDate)} by ${po.createdBy.name}`}
        actions={
          canManage && (
            <PurchaseOrderActions
              purchaseOrderId={po.id}
              poNumber={po.poNumber}
              canEdit={po.status === "DRAFT"}
              canSubmit={po.status === "DRAFT"}
              canCancel={(po.status === "DRAFT" || po.status === "OPEN") && !hasReceipts}
              canShortClose={po.status === "PARTIALLY_RECEIVED"}
            />
          )
        }
      />

      {postedGrn && (
        <Alert tone="success" className="mb-6">
          {postedGrn} posted. Stock has been updated.
        </Alert>
      )}
      {po.status === "CANCELLED" && (
        <Card className="mb-6 border-slate-300 bg-slate-50">
          <CardBody className="text-sm text-slate-700">
            Cancelled {formatDateTime(po.cancelledAt)} by {po.cancelledBy?.name}: {po.cancelReason}
          </CardBody>
        </Card>
      )}
      {po.status === "SHORT_CLOSED" && (
        <Card className="mb-6 border-slate-300 bg-slate-50">
          <CardBody className="text-sm text-slate-700">
            Short-closed {formatDateTime(po.closedAt)} by {po.closedBy?.name}: {po.closeReason}
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader
          title="Items"
          description={
            <>
              Expected {formatDate(po.expectedDate)}
              {po.remarks && <> · {po.remarks}</>}
            </>
          }
        />
        <Table>
          <THead>
            <tr>
              <TH>#</TH>
              <TH>SKU</TH>
              <TH numeric>Ordered</TH>
              <TH numeric>Received</TH>
              <TH numeric>Pending</TH>
              <TH numeric>Rate (₹)</TH>
              <TH numeric>GST %</TH>
            </tr>
          </THead>
          <TBody>
            {po.items.map((item) => {
              const pending = item.orderedQty.minus(item.receivedQty);
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
                    <Quantity value={item.orderedQty} unit={item.sku.baseUom.code} />
                    {item.entryUom && item.entryQuantity && (
                      <span className="block text-xs text-slate-500">
                        entered as {item.entryQuantity.toString()} {item.entryUom.code}
                      </span>
                    )}
                  </TD>
                  <TD numeric>
                    <Quantity value={item.receivedQty} />
                  </TD>
                  <TD numeric>
                    <Quantity value={pending} className={pending.greaterThan(0) ? "font-medium text-amber-700" : undefined} />
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

      {godowns.length > 0 && pendingLines.length > 0 && (
        <div className="mt-6">
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
        </div>
      )}

      <Card className="mt-6">
        <CardHeader title="Goods receipts" />
        {po.grns.length > 0 ? (
          <Table>
            <THead>
              <tr>
                <TH>GRN</TH>
                <TH>Received</TH>
                <TH>Godown</TH>
                <TH>By</TH>
                <TH>Status</TH>
              </tr>
            </THead>
            <TBody>
              {po.grns.map((grn) => (
                <TR key={grn.id}>
                  <TD>
                    <Link href={`/grns/${grn.id}`} className="font-mono text-xs font-medium text-brand-700 hover:underline">
                      {grn.grnNumber}
                    </Link>
                  </TD>
                  <TD className="text-xs">{formatDateTime(grn.receivedAt)}</TD>
                  <TD>{grn.godown.name}</TD>
                  <TD className="text-xs">{grn.createdBy.name}</TD>
                  <TD>
                    <StatusBadge status={grn.status} />
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        ) : (
          <CardBody className="text-sm text-slate-500">No goods received yet.</CardBody>
        )}
      </Card>
    </>
  );
}
