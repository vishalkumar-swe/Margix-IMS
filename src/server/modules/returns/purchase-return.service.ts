import { randomUUID } from "node:crypto";
import type { InventoryLedger, PurchaseReturn } from "@prisma/client";
import type { PurchaseReturnCreateInput } from "@/lib/validation/returns";
import type { Actor } from "@/server/actor";
import { prisma } from "@/server/db/client";
import { toDecimal } from "@/server/db/decimal";
import { lockRowForUpdate } from "@/server/db/locks";
import { withTx, type Tx } from "@/server/db/transaction";
import { BusinessRuleError, ConflictError, NotFoundError, ValidationError } from "@/server/errors";
import { recordAudit } from "@/server/modules/audit/audit.service";
import {
  derivePostedDocStatus,
  nextDocumentNumber,
  withIdempotency,
} from "@/server/modules/documents/documents.service";
import { postMovements } from "@/server/modules/inventory/ledger.service";
import { assertUomPrecision } from "@/server/modules/inventory/movement-rules";
import { loadActiveGodown, loadTransactableSkus } from "@/server/modules/masters/masters.queries";
import { lockPurchaseOrder, recomputePurchaseOrderStatus } from "@/server/modules/purchasing/purchase-order.service";
import { enqueueTallySync } from "@/server/modules/tally/tally-queue.service";

/**
 * Returns to supplier (RETURN_OUT), always against a GRN. A line can return
 * at most its accepted quantity (net of earlier returns). The returned
 * quantity no longer counts as received on the purchase order, so a
 * replacement can be received against it.
 */
export function postPurchaseReturn(actor: Actor, input: PurchaseReturnCreateInput): Promise<PurchaseReturn> {
  return withIdempotency(
    input.idempotencyKey,
    (key) => prisma.purchaseReturn.findUnique({ where: { idempotencyKey: key } }),
    () => withTx((tx) => postInTx(tx, actor, input)),
  );
}

async function postInTx(tx: Tx, actor: Actor, input: PurchaseReturnCreateInput): Promise<PurchaseReturn> {
  const header = await tx.grn.findUnique({ where: { id: input.grnId }, select: { purchaseOrderId: true } });
  if (!header) throw new NotFoundError("GRN", input.grnId);
  // Lock order: purchase order → GRN → stock (same as posting a GRN).
  const po = await lockPurchaseOrder(tx, header.purchaseOrderId);
  await lockRowForUpdate(tx, "grn", input.grnId);

  const grn = await tx.grn.findUniqueOrThrow({
    where: { id: input.grnId },
    include: { items: { include: { ledgerEntry: { select: { reversedBy: { select: { id: true } } } } } } },
  });
  const godownId = input.godownId ?? grn.godownId;
  await loadActiveGodown(tx, godownId);

  const itemById = new Map(grn.items.map((item) => [item.id, item]));
  const skus = await loadTransactableSkus(
    tx,
    grn.items.map((i) => i.skuId),
  );

  const lines = input.items.map((line) => {
    const item = itemById.get(line.grnItemId);
    if (!item) throw new ValidationError("A line does not belong to this GRN.", { grnItemId: line.grnItemId });
    const sku = skus.get(item.skuId)!;
    const quantity = toDecimal(line.quantity);
    assertUomPrecision(quantity, sku);

    const returnable =
      !item.ledgerEntry || item.ledgerEntry.reversedBy ? toDecimal(0) : item.acceptedQty.minus(item.returnedQty);
    if (quantity.greaterThan(returnable)) {
      throw new BusinessRuleError("OVER_RETURN", "Return quantity exceeds the accepted quantity on this line.", {
        sku: sku.code,
        accepted: item.acceptedQty.toString(),
        alreadyReturned: item.returnedQty.toString(),
        returnable: returnable.toString(),
        returning: quantity.toString(),
      });
    }
    return { id: randomUUID(), item, sku, quantity };
  });

  const returnNumber = await nextDocumentNumber(tx, "PRN");
  const purchaseReturn = await tx.purchaseReturn.create({
    data: {
      returnNumber,
      grnId: grn.id,
      supplierId: po.supplierId,
      godownId,
      returnedAt: new Date(),
      reason: input.reason,
      remarks: input.remarks,
      idempotencyKey: input.idempotencyKey,
      createdById: actor.userId,
    },
  });

  const entries = await postMovements(
    tx,
    actor,
    lines.map((l) => ({
      key: { skuId: l.sku.id, godownId, batchId: l.item.batchId },
      movementType: "RETURN_OUT",
      quantity: l.quantity.negated(),
      reference: { type: "PURCHASE_RETURN", id: purchaseReturn.id, no: returnNumber, lineId: l.id },
      remarks: input.reason,
    })),
  );

  await tx.purchaseReturnItem.createMany({
    data: lines.map((l, index) => ({
      id: l.id,
      purchaseReturnId: purchaseReturn.id,
      grnItemId: l.item.id,
      skuId: l.sku.id,
      batchId: l.item.batchId,
      quantity: l.quantity,
      ledgerEntryId: entries[index].id,
    })),
  });
  for (const l of lines) {
    await tx.grnItem.update({ where: { id: l.item.id }, data: { returnedQty: { increment: l.quantity } } });
    await tx.purchaseOrderItem.update({
      where: { id: l.item.purchaseOrderItemId },
      data: { receivedQty: { decrement: l.quantity } },
    });
  }
  await recomputePurchaseOrderStatus(tx, po.id);

  await enqueueTallySync(tx, {
    entityType: "PURCHASE_RETURN",
    entityId: purchaseReturn.id,
    entityNo: returnNumber,
    godownId,
  });
  await recordAudit(tx, actor, {
    action: "PURCHASE_RETURN_POSTED",
    entityType: "PurchaseReturn",
    entityId: purchaseReturn.id,
    newData: {
      returnNumber,
      grn: grn.grnNumber,
      reason: input.reason,
      lines: lines.map((l) => ({ sku: l.sku.code, quantity: l.quantity })),
    },
  });
  return purchaseReturn;
}

/**
 * Reversing a return line restores it as received on the PO. Refused if the
 * order has meanwhile been received in full again (it would exceed the order).
 */
export async function onPurchaseReturnEntryReversed(tx: Tx, entry: InventoryLedger): Promise<void> {
  const item = await tx.purchaseReturnItem.findUniqueOrThrow({
    where: { ledgerEntryId: entry.id },
    include: { grnItem: { include: { purchaseOrderItem: true } } },
  });
  const poItem = item.grnItem.purchaseOrderItem;
  if (poItem.receivedQty.plus(item.quantity).greaterThan(poItem.orderedQty)) {
    throw new ConflictError(
      "CANNOT_REVERSE",
      "The purchase order has since been received in full; reversing this return would exceed the ordered quantity.",
    );
  }

  await tx.grnItem.update({ where: { id: item.grnItemId }, data: { returnedQty: { decrement: item.quantity } } });
  await tx.purchaseOrderItem.update({ where: { id: poItem.id }, data: { receivedQty: { increment: item.quantity } } });
  await recomputePurchaseOrderStatus(tx, poItem.purchaseOrderId);

  const [total, reversed] = await Promise.all([
    tx.purchaseReturnItem.count({ where: { purchaseReturnId: item.purchaseReturnId } }),
    tx.purchaseReturnItem.count({
      where: { purchaseReturnId: item.purchaseReturnId, ledgerEntry: { reversedBy: { isNot: null } } },
    }),
  ]);
  await tx.purchaseReturn.update({
    where: { id: item.purchaseReturnId },
    data: { status: derivePostedDocStatus(total, reversed) },
  });
}
