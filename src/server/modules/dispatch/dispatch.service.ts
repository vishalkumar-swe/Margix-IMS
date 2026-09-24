import { randomUUID } from "node:crypto";
import type { InventoryLedger, Outward } from "@prisma/client";
import type { DispatchCreateInput } from "@/lib/validation/dispatch";
import type { Actor } from "@/server/actor";
import { prisma } from "@/server/db/client";
import { toDecimal } from "@/server/db/decimal";
import { withTx, type Tx } from "@/server/db/transaction";
import { recordAudit } from "@/server/modules/audit/audit.service";
import {
  derivePostedDocStatus,
  nextDocumentNumber,
  withIdempotency,
} from "@/server/modules/documents/documents.service";
import { getBatchForSku } from "@/server/modules/inventory/batch.service";
import { postMovements } from "@/server/modules/inventory/ledger.service";
import { assertUomPrecision } from "@/server/modules/inventory/movement-rules";
import {
  loadActiveCustomer,
  loadActiveGodown,
  loadTransactableSkus,
} from "@/server/modules/masters/masters.queries";
import { enqueueTallySync } from "@/server/modules/tally/tally-queue.service";

/**
 * Posts an outward dispatch (spec §6.2). Every line names a batch; stock is
 * validated per batch atomically, so a dispatch beyond available stock is
 * rejected with INSUFFICIENT_STOCK and nothing is written.
 */
export function postDispatch(actor: Actor, input: DispatchCreateInput): Promise<Outward> {
  return withIdempotency(
    input.idempotencyKey,
    (key) => prisma.outward.findUnique({ where: { idempotencyKey: key } }),
    () => withTx((tx) => postDispatchInTx(tx, actor, input)),
  );
}

async function postDispatchInTx(tx: Tx, actor: Actor, input: DispatchCreateInput): Promise<Outward> {
  await loadActiveGodown(tx, input.godownId);
  if (input.customerId) await loadActiveCustomer(tx, input.customerId);
  const skus = await loadTransactableSkus(
    tx,
    input.items.map((i) => i.skuId),
  );

  const lines = [];
  for (const item of input.items) {
    const sku = skus.get(item.skuId)!;
    await getBatchForSku(tx, item.skuId, item.batchId);
    const quantity = toDecimal(item.quantity);
    assertUomPrecision(quantity, sku);
    lines.push({ id: randomUUID(), item, sku, quantity });
  }

  const outwardNumber = await nextDocumentNumber(tx, "DSP");
  const outward = await tx.outward.create({
    data: {
      outwardNumber,
      godownId: input.godownId,
      customerId: input.customerId,
      dispatchedAt: new Date(),
      vehicleNo: input.vehicleNo,
      referenceNo: input.referenceNo,
      remarks: input.remarks,
      idempotencyKey: input.idempotencyKey,
      createdById: actor.userId,
    },
  });

  const entries = await postMovements(
    tx,
    actor,
    lines.map((l) => ({
      key: { skuId: l.sku.id, godownId: input.godownId, batchId: l.item.batchId },
      movementType: "OUTWARD",
      quantity: l.quantity.negated(),
      reference: { type: "DISPATCH", id: outward.id, no: outwardNumber, lineId: l.id },
    })),
  );

  await tx.outwardItem.createMany({
    data: lines.map((l, index) => ({
      id: l.id,
      outwardId: outward.id,
      skuId: l.sku.id,
      batchId: l.item.batchId,
      quantity: l.quantity,
      ledgerEntryId: entries[index].id,
    })),
  });

  await enqueueTallySync(tx, {
    entityType: "DISPATCH",
    entityId: outward.id,
    entityNo: outwardNumber,
    godownId: input.godownId,
  });
  await recordAudit(tx, actor, {
    action: "DISPATCH_POSTED",
    entityType: "Outward",
    entityId: outward.id,
    newData: {
      outwardNumber,
      lines: lines.map((l) => ({ sku: l.sku.code, batchId: l.item.batchId, quantity: l.quantity })),
    },
  });
  return outward;
}

export async function onDispatchEntryReversed(tx: Tx, entry: InventoryLedger): Promise<void> {
  const item = await tx.outwardItem.findUniqueOrThrow({ where: { ledgerEntryId: entry.id } });
  const [total, reversed] = await Promise.all([
    tx.outwardItem.count({ where: { outwardId: item.outwardId } }),
    tx.outwardItem.count({ where: { outwardId: item.outwardId, ledgerEntry: { reversedBy: { isNot: null } } } }),
  ]);
  await tx.outward.update({ where: { id: item.outwardId }, data: { status: derivePostedDocStatus(total, reversed) } });
}
