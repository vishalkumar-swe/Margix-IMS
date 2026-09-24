import { randomUUID } from "node:crypto";
import type { InventoryLedger, SalesReturn } from "@prisma/client";
import type { SalesReturnCreateInput } from "@/lib/validation/returns";
import type { Actor } from "@/server/actor";
import { prisma } from "@/server/db/client";
import { toDecimal } from "@/server/db/decimal";
import { lockRowForUpdate } from "@/server/db/locks";
import { withTx, type Tx } from "@/server/db/transaction";
import { BusinessRuleError, NotFoundError, ValidationError } from "@/server/errors";
import { recordAudit } from "@/server/modules/audit/audit.service";
import {
  derivePostedDocStatus,
  nextDocumentNumber,
  withIdempotency,
} from "@/server/modules/documents/documents.service";
import { postMovements } from "@/server/modules/inventory/ledger.service";
import { assertUomPrecision } from "@/server/modules/inventory/movement-rules";
import { loadActiveGodown, loadTransactableSkus } from "@/server/modules/masters/masters.queries";
import { enqueueTallySync } from "@/server/modules/tally/tally-queue.service";

/**
 * Customer returns (RETURN_IN), always against a dispatch so every returned
 * unit traces back to the batch that left. A line can return at most what was
 * dispatched on it (net of earlier returns); a reversed dispatch line cannot
 * be returned at all.
 */
export function postSalesReturn(actor: Actor, input: SalesReturnCreateInput): Promise<SalesReturn> {
  return withIdempotency(
    input.idempotencyKey,
    (key) => prisma.salesReturn.findUnique({ where: { idempotencyKey: key } }),
    () => withTx((tx) => postInTx(tx, actor, input)),
  );
}

async function postInTx(tx: Tx, actor: Actor, input: SalesReturnCreateInput): Promise<SalesReturn> {
  if (!(await lockRowForUpdate(tx, "outward", input.outwardId))) throw new NotFoundError("Dispatch", input.outwardId);
  const outward = await tx.outward.findUniqueOrThrow({
    where: { id: input.outwardId },
    include: { items: { include: { ledgerEntry: { select: { reversedBy: { select: { id: true } } } } } } },
  });
  const godownId = input.godownId ?? outward.godownId;
  await loadActiveGodown(tx, godownId);

  const itemById = new Map(outward.items.map((item) => [item.id, item]));
  const skus = await loadTransactableSkus(
    tx,
    outward.items.map((i) => i.skuId),
  );

  const lines = input.items.map((line) => {
    const item = itemById.get(line.outwardItemId);
    if (!item) {
      throw new ValidationError("A line does not belong to this dispatch.", { outwardItemId: line.outwardItemId });
    }
    const sku = skus.get(item.skuId)!;
    const quantity = toDecimal(line.quantity);
    assertUomPrecision(quantity, sku);

    const returnable = item.ledgerEntry.reversedBy ? toDecimal(0) : item.quantity.minus(item.returnedQty);
    if (quantity.greaterThan(returnable)) {
      throw new BusinessRuleError("OVER_RETURN", "Return quantity exceeds what was dispatched on this line.", {
        sku: sku.code,
        dispatched: item.quantity.toString(),
        alreadyReturned: item.returnedQty.toString(),
        returnable: returnable.toString(),
        returning: quantity.toString(),
      });
    }
    return { id: randomUUID(), item, sku, quantity };
  });

  const returnNumber = await nextDocumentNumber(tx, "SRN");
  const salesReturn = await tx.salesReturn.create({
    data: {
      returnNumber,
      outwardId: outward.id,
      customerId: outward.customerId,
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
      movementType: "RETURN_IN",
      quantity: l.quantity,
      reference: { type: "SALES_RETURN", id: salesReturn.id, no: returnNumber, lineId: l.id },
      remarks: input.reason,
    })),
  );

  await tx.salesReturnItem.createMany({
    data: lines.map((l, index) => ({
      id: l.id,
      salesReturnId: salesReturn.id,
      outwardItemId: l.item.id,
      skuId: l.sku.id,
      batchId: l.item.batchId,
      quantity: l.quantity,
      ledgerEntryId: entries[index].id,
    })),
  });
  for (const l of lines) {
    await tx.outwardItem.update({ where: { id: l.item.id }, data: { returnedQty: { increment: l.quantity } } });
  }

  await enqueueTallySync(tx, { entityType: "SALES_RETURN", entityId: salesReturn.id, entityNo: returnNumber, godownId });
  await recordAudit(tx, actor, {
    action: "SALES_RETURN_POSTED",
    entityType: "SalesReturn",
    entityId: salesReturn.id,
    newData: {
      returnNumber,
      dispatch: outward.outwardNumber,
      reason: input.reason,
      lines: lines.map((l) => ({ sku: l.sku.code, quantity: l.quantity })),
    },
  });
  return salesReturn;
}

/** A reversed return line no longer counts as returned on its dispatch line. */
export async function onSalesReturnEntryReversed(tx: Tx, entry: InventoryLedger): Promise<void> {
  const item = await tx.salesReturnItem.findUniqueOrThrow({ where: { ledgerEntryId: entry.id } });
  await tx.outwardItem.update({ where: { id: item.outwardItemId }, data: { returnedQty: { decrement: item.quantity } } });

  const [total, reversed] = await Promise.all([
    tx.salesReturnItem.count({ where: { salesReturnId: item.salesReturnId } }),
    tx.salesReturnItem.count({
      where: { salesReturnId: item.salesReturnId, ledgerEntry: { reversedBy: { isNot: null } } },
    }),
  ]);
  await tx.salesReturn.update({
    where: { id: item.salesReturnId },
    data: { status: derivePostedDocStatus(total, reversed) },
  });
}
