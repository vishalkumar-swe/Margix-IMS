import { randomUUID } from "node:crypto";
import type { Batch, Grn, InventoryLedger } from "@prisma/client";
import { dateOnlyToUtc } from "@/lib/dates";
import type { GrnCreateInput } from "@/lib/validation/purchasing";
import type { Actor } from "@/server/actor";
import { prisma } from "@/server/db/client";
import { toDecimal, ZERO, type Decimal } from "@/server/db/decimal";
import { withTx, type Tx } from "@/server/db/transaction";
import { BusinessRuleError, ConflictError, ValidationError } from "@/server/errors";
import { recordAudit } from "@/server/modules/audit/audit.service";
import {
  derivePostedDocStatus,
  nextDocumentNumber,
  withIdempotency,
} from "@/server/modules/documents/documents.service";
import { resolveBatch } from "@/server/modules/inventory/batch.service";
import type { PostMovementInput } from "@/server/modules/inventory/inventory.types";
import { postMovements } from "@/server/modules/inventory/ledger.service";
import { assertUomPrecision } from "@/server/modules/inventory/movement-rules";
import { loadActiveGodown, loadTransactableSkus } from "@/server/modules/masters/masters.queries";
import { enqueueTallySync } from "@/server/modules/tally/tally-queue.service";
import { lockPurchaseOrder, recomputePurchaseOrderStatus } from "./purchase-order.service";

/**
 * Posts a Goods Receipt Note against a purchase order (spec §6.1). Records the
 * physical receipt; only the ACCEPTED quantity enters stock. Everything —
 * GRN, ledger entries, PO progress, Tally queue, audit — commits atomically.
 */
export function postGrn(actor: Actor, purchaseOrderId: string, input: GrnCreateInput): Promise<Grn> {
  return withIdempotency(
    input.idempotencyKey,
    (key) => prisma.grn.findUnique({ where: { idempotencyKey: key } }),
    () => withTx((tx) => postGrnInTx(tx, actor, purchaseOrderId, input)),
  );
}

async function postGrnInTx(tx: Tx, actor: Actor, purchaseOrderId: string, input: GrnCreateInput): Promise<Grn> {
  const po = await lockPurchaseOrder(tx, purchaseOrderId);
  if (po.status !== "OPEN" && po.status !== "PARTIALLY_RECEIVED") {
    throw new ConflictError(
      "INVALID_STATE",
      `Goods can only be received against an open purchase order (${po.poNumber} is ${po.status}).`,
    );
  }
  await loadActiveGodown(tx, input.godownId);

  const poItems = new Map(po.items.map((item) => [item.id, item]));
  const skus = await loadTransactableSkus(
    tx,
    po.items.map((i) => i.skuId),
  );

  // Validate every line and the cumulative receipt per PO line before writing anything.
  const acceptedByPoItem = new Map<string, Decimal>();
  const lines = input.items.map((line) => {
    const poItem = poItems.get(line.purchaseOrderItemId);
    if (!poItem) {
      throw new ValidationError("A line does not belong to this purchase order.", {
        purchaseOrderItemId: line.purchaseOrderItemId,
      });
    }
    const sku = skus.get(poItem.skuId)!;
    const received = toDecimal(line.receivedQty);
    const accepted = toDecimal(line.acceptedQty);
    assertUomPrecision(received, sku);
    assertUomPrecision(accepted, sku);
    acceptedByPoItem.set(poItem.id, (acceptedByPoItem.get(poItem.id) ?? ZERO).plus(accepted));
    return { line, poItem, sku, received, accepted, id: randomUUID() };
  });

  for (const [poItemId, accepted] of acceptedByPoItem) {
    const poItem = poItems.get(poItemId)!;
    const pending = poItem.orderedQty.minus(poItem.receivedQty);
    if (accepted.greaterThan(pending)) {
      throw new BusinessRuleError("OVER_RECEIPT", "Accepted quantity exceeds the quantity pending on the order.", {
        sku: skus.get(poItem.skuId)!.code,
        ordered: poItem.orderedQty.toString(),
        alreadyReceived: poItem.receivedQty.toString(),
        pending: pending.toString(),
        accepting: accepted.toString(),
      });
    }
  }

  const grnNumber = await nextDocumentNumber(tx, "GRN");
  const grn = await tx.grn.create({
    data: {
      grnNumber,
      purchaseOrderId: po.id,
      godownId: input.godownId,
      receivedAt: new Date(),
      supplierInvoiceNo: input.supplierInvoiceNo,
      remarks: input.remarks,
      idempotencyKey: input.idempotencyKey,
      createdById: actor.userId,
    },
  });

  const batches: Batch[] = [];
  for (const l of lines) {
    batches.push(
      await resolveBatch(tx, l.sku, {
        batchNumber: l.line.batchNumber,
        manufacturingDate: l.line.manufacturingDate ? dateOnlyToUtc(l.line.manufacturingDate) : null,
        expiryDate: l.line.expiryDate ? dateOnlyToUtc(l.line.expiryDate) : null,
      }),
    );
  }

  const movementLines = lines
    .map((l, index) => ({ ...l, batch: batches[index] }))
    .filter((l) => l.accepted.greaterThan(0));
  const movements: PostMovementInput[] = movementLines.map((l) => ({
    key: { skuId: l.sku.id, godownId: input.godownId, batchId: l.batch.id },
    movementType: "INWARD",
    quantity: l.accepted,
    reference: { type: "GRN", id: grn.id, no: grnNumber, lineId: l.id },
  }));
  const entries = await postMovements(tx, actor, movements);
  const entryByLine = new Map<string, InventoryLedger>(movementLines.map((l, i) => [l.id, entries[i]]));

  await tx.grnItem.createMany({
    data: lines.map((l, index) => ({
      id: l.id,
      grnId: grn.id,
      purchaseOrderItemId: l.poItem.id,
      skuId: l.sku.id,
      batchId: batches[index].id,
      receivedQty: l.received,
      acceptedQty: l.accepted,
      rejectedQty: l.received.minus(l.accepted),
      rejectionReason: l.line.rejectionReason ?? null,
      ledgerEntryId: entryByLine.get(l.id)?.id ?? null,
    })),
  });

  for (const [poItemId, accepted] of acceptedByPoItem) {
    if (accepted.greaterThan(0)) {
      await tx.purchaseOrderItem.update({
        where: { id: poItemId },
        data: { receivedQty: { increment: accepted } },
      });
    }
  }
  const poStatus = await recomputePurchaseOrderStatus(tx, po.id);

  if (entries.length > 0) {
    await enqueueTallySync(tx, { entityType: "GRN", entityId: grn.id, entityNo: grnNumber, godownId: input.godownId });
  }
  await recordAudit(tx, actor, {
    action: "GRN_POSTED",
    entityType: "Grn",
    entityId: grn.id,
    newData: {
      grnNumber,
      poNumber: po.poNumber,
      poStatus,
      lines: lines.map((l) => ({
        sku: l.sku.code,
        received: l.received,
        accepted: l.accepted,
      })),
    },
  });
  return grn;
}

/**
 * Side effects of reversing a GRN ledger entry: the accepted quantity no
 * longer counts as received on the PO, and the GRN's status reflects it.
 */
export async function onGrnEntryReversed(tx: Tx, entry: InventoryLedger): Promise<void> {
  const item = await tx.grnItem.findUniqueOrThrow({
    where: { ledgerEntryId: entry.id },
    include: { grn: true, purchaseOrderItem: true },
  });

  await lockPurchaseOrder(tx, item.grn.purchaseOrderId);
  await tx.purchaseOrderItem.update({
    where: { id: item.purchaseOrderItemId },
    data: { receivedQty: { decrement: entry.quantity } },
  });
  await recomputePurchaseOrderStatus(tx, item.grn.purchaseOrderId);

  const [total, reversed] = await Promise.all([
    tx.grnItem.count({ where: { grnId: item.grnId, ledgerEntryId: { not: null } } }),
    tx.grnItem.count({ where: { grnId: item.grnId, ledgerEntry: { reversedBy: { isNot: null } } } }),
  ]);
  await tx.grn.update({ where: { id: item.grnId }, data: { status: derivePostedDocStatus(total, reversed) } });
}
