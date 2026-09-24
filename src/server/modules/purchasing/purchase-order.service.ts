import type { PurchaseOrder, PurchaseOrderItem, PurchaseOrderStatus } from "@prisma/client";
import { dateOnlyToUtc } from "@/lib/dates";
import type { PoCreateInput, PoUpdateInput } from "@/lib/validation/purchasing";
import type { Actor } from "@/server/actor";
import { prisma } from "@/server/db/client";
import { toDecimal } from "@/server/db/decimal";
import { lockRowForUpdate } from "@/server/db/locks";
import { withTx, type Tx } from "@/server/db/transaction";
import { ConflictError, NotFoundError, ValidationError } from "@/server/errors";
import { recordAudit } from "@/server/modules/audit/audit.service";
import { nextDocumentNumber, withIdempotency } from "@/server/modules/documents/documents.service";
import { assertUomPrecision } from "@/server/modules/inventory/movement-rules";
import { loadActiveSupplier, loadTransactableSkus } from "@/server/modules/masters/masters.queries";

export type LockedPurchaseOrder = PurchaseOrder & { items: PurchaseOrderItem[] };

/**
 * Purchase order lifecycle (spec §6.1):
 * DRAFT → OPEN → PARTIALLY_RECEIVED → FULLY_RECEIVED, or DRAFT/OPEN → CANCELLED.
 * Receipt-driven statuses are derived by recomputePurchaseOrderStatus.
 */

export function createPurchaseOrder(actor: Actor, input: PoCreateInput): Promise<PurchaseOrder> {
  return withIdempotency(
    input.idempotencyKey,
    (key) => prisma.purchaseOrder.findUnique({ where: { idempotencyKey: key } }),
    () =>
      withTx(async (tx) => {
        await validatePoContent(tx, input);
        const poNumber = await nextDocumentNumber(tx, "PO");
        const now = new Date();

        const po = await tx.purchaseOrder.create({
          data: {
            poNumber,
            supplierId: input.supplierId,
            status: input.submit ? "OPEN" : "DRAFT",
            orderDate: dateOnlyToUtc(input.orderDate),
            expectedDate: input.expectedDate ? dateOnlyToUtc(input.expectedDate) : null,
            remarks: input.remarks,
            idempotencyKey: input.idempotencyKey,
            createdById: actor.userId,
            submittedAt: input.submit ? now : null,
            items: { create: toItemRows(input.items) },
          },
          include: { items: true },
        });
        await recordAudit(tx, actor, { action: "PO_CREATED", entityType: "PurchaseOrder", entityId: po.id, newData: po });
        return po;
      }),
  );
}

/** Replaces header and lines of a DRAFT purchase order. */
export function updateDraftPurchaseOrder(actor: Actor, id: string, input: PoUpdateInput): Promise<PurchaseOrder> {
  return withTx(async (tx) => {
    const before = await lockPurchaseOrder(tx, id);
    if (before.status !== "DRAFT") {
      throw new ConflictError("INVALID_STATE", `Only draft purchase orders can be edited (${before.poNumber} is ${before.status}).`);
    }
    await validatePoContent(tx, input);

    await tx.purchaseOrderItem.deleteMany({ where: { purchaseOrderId: id } });
    const after = await tx.purchaseOrder.update({
      where: { id },
      data: {
        supplierId: input.supplierId,
        orderDate: dateOnlyToUtc(input.orderDate),
        expectedDate: input.expectedDate ? dateOnlyToUtc(input.expectedDate) : null,
        remarks: input.remarks ?? null,
        items: { create: toItemRows(input.items) },
      },
      include: { items: true },
    });
    await recordAudit(tx, actor, {
      action: "PO_UPDATED",
      entityType: "PurchaseOrder",
      entityId: id,
      oldData: before,
      newData: after,
    });
    return after;
  });
}

export function submitPurchaseOrder(actor: Actor, id: string): Promise<PurchaseOrder> {
  return withTx(async (tx) => {
    const { count } = await tx.purchaseOrder.updateMany({
      where: { id, status: "DRAFT" },
      data: { status: "OPEN", submittedAt: new Date() },
    });
    if (count === 0) throw await stateError(tx, id, "Only draft purchase orders can be submitted.");

    const po = await tx.purchaseOrder.findUniqueOrThrow({ where: { id } });
    await recordAudit(tx, actor, { action: "PO_SUBMITTED", entityType: "PurchaseOrder", entityId: id });
    return po;
  });
}

/** Cancels a DRAFT or OPEN order that has no net receipts. */
export function cancelPurchaseOrder(actor: Actor, id: string, reason: string): Promise<PurchaseOrder> {
  return withTx(async (tx) => {
    const po = await lockPurchaseOrder(tx, id);
    if (po.status !== "DRAFT" && po.status !== "OPEN") {
      throw new ConflictError("INVALID_STATE", `${po.poNumber} is ${po.status} and cannot be cancelled.`);
    }
    if (po.items.some((item) => item.receivedQty.greaterThan(0))) {
      throw new ConflictError("INVALID_STATE", `${po.poNumber} has received goods and cannot be cancelled.`);
    }

    const cancelled = await tx.purchaseOrder.update({
      where: { id },
      data: { status: "CANCELLED", cancelledAt: new Date(), cancelledById: actor.userId, cancelReason: reason },
    });
    await recordAudit(tx, actor, {
      action: "PO_CANCELLED",
      entityType: "PurchaseOrder",
      entityId: id,
      newData: { reason },
    });
    return cancelled;
  });
}

/** Locks a purchase order row for the rest of the transaction and loads its lines. */
export async function lockPurchaseOrder(tx: Tx, id: string): Promise<LockedPurchaseOrder> {
  if (!(await lockRowForUpdate(tx, "purchase_order", id))) throw new NotFoundError("Purchase order", id);
  return tx.purchaseOrder.findUniqueOrThrow({
    where: { id },
    include: { items: { orderBy: { lineNo: "asc" } } },
  });
}

/**
 * Short-closes a partially received order: the remaining quantity will not
 * be delivered, so no further receipts are accepted.
 */
export function shortClosePurchaseOrder(actor: Actor, id: string, reason: string): Promise<PurchaseOrder> {
  return withTx(async (tx) => {
    const po = await lockPurchaseOrder(tx, id);
    if (po.status !== "PARTIALLY_RECEIVED") {
      throw new ConflictError(
        "INVALID_STATE",
        `Only partially received orders can be short-closed (${po.poNumber} is ${po.status}).`,
      );
    }
    const closed = await tx.purchaseOrder.update({
      where: { id },
      data: { status: "SHORT_CLOSED", closedAt: new Date(), closedById: actor.userId, closeReason: reason },
    });
    await recordAudit(tx, actor, {
      action: "PO_SHORT_CLOSED",
      entityType: "PurchaseOrder",
      entityId: id,
      newData: {
        reason,
        pending: po.items.map((i) => ({ skuId: i.skuId, pending: i.orderedQty.minus(i.receivedQty) })),
      },
    });
    return closed;
  });
}

/** Derives the receipt status from line quantities (never for DRAFT/SHORT_CLOSED/CANCELLED orders). */
export async function recomputePurchaseOrderStatus(tx: Tx, id: string): Promise<PurchaseOrderStatus> {
  const po = await tx.purchaseOrder.findUniqueOrThrow({ where: { id }, include: { items: true } });
  if (po.status === "DRAFT" || po.status === "CANCELLED" || po.status === "SHORT_CLOSED") return po.status;

  const status: PurchaseOrderStatus = po.items.every((i) => i.receivedQty.greaterThanOrEqualTo(i.orderedQty))
    ? "FULLY_RECEIVED"
    : po.items.some((i) => i.receivedQty.greaterThan(0))
      ? "PARTIALLY_RECEIVED"
      : "OPEN";

  if (status !== po.status) await tx.purchaseOrder.update({ where: { id }, data: { status } });
  return status;
}

async function validatePoContent(tx: Tx, input: PoUpdateInput): Promise<void> {
  await loadActiveSupplier(tx, input.supplierId);
  const skus = await loadTransactableSkus(
    tx,
    input.items.map((i) => i.skuId),
  );
  for (const item of input.items) {
    const sku = skus.get(item.skuId)!;
    if (sku.status !== "ACTIVE") throw new ValidationError(`SKU ${sku.code} is not active.`, { sku: sku.code });
    assertUomPrecision(toDecimal(item.orderedQty), sku);
  }
}

function toItemRows(items: PoUpdateInput["items"]) {
  return items.map((item, index) => ({
    lineNo: index + 1,
    skuId: item.skuId,
    orderedQty: item.orderedQty,
    rate: item.rate ?? null,
    gstRate: item.gstRate ?? null,
  }));
}

async function stateError(tx: Tx, id: string, message: string) {
  const po = await tx.purchaseOrder.findUnique({ where: { id }, select: { poNumber: true, status: true } });
  if (!po) return new NotFoundError("Purchase order", id);
  return new ConflictError("INVALID_STATE", `${message} (${po.poNumber} is ${po.status}).`);
}
