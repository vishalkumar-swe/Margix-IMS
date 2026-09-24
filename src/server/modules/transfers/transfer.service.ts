import { randomUUID } from "node:crypto";
import type { InventoryLedger, Transfer } from "@prisma/client";
import type { TransferCreateInput } from "@/lib/validation/transfers";
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
import type { PostMovementInput } from "@/server/modules/inventory/inventory.types";
import { postMovements } from "@/server/modules/inventory/ledger.service";
import { assertUomPrecision } from "@/server/modules/inventory/movement-rules";
import { loadActiveGodown, loadTransactableSkus } from "@/server/modules/masters/masters.queries";
import { enqueueTallySync } from "@/server/modules/tally/tally-queue.service";

/**
 * Moves stock between godowns. Each line posts TRANSFER_OUT from the source
 * and TRANSFER_IN to the destination in one transaction, keeping the batch
 * identity, so total company stock never changes and stock is never "in
 * limbo". Source stock is validated like any outward movement.
 */
export function postTransfer(actor: Actor, input: TransferCreateInput): Promise<Transfer> {
  return withIdempotency(
    input.idempotencyKey,
    (key) => prisma.transfer.findUnique({ where: { idempotencyKey: key } }),
    () => withTx((tx) => postTransferInTx(tx, actor, input)),
  );
}

async function postTransferInTx(tx: Tx, actor: Actor, input: TransferCreateInput): Promise<Transfer> {
  await loadActiveGodown(tx, input.fromGodownId);
  await loadActiveGodown(tx, input.toGodownId);
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
    lines.push({ id: randomUUID(), sku, batchId: item.batchId, quantity });
  }

  const transferNumber = await nextDocumentNumber(tx, "TRF");
  const transfer = await tx.transfer.create({
    data: {
      transferNumber,
      fromGodownId: input.fromGodownId,
      toGodownId: input.toGodownId,
      transferredAt: new Date(),
      remarks: input.remarks,
      idempotencyKey: input.idempotencyKey,
      createdById: actor.userId,
    },
  });

  const reference = (lineId: string) => ({ type: "TRANSFER" as const, id: transfer.id, no: transferNumber, lineId });
  const movements: PostMovementInput[] = lines.flatMap((l) => [
    {
      key: { skuId: l.sku.id, godownId: input.fromGodownId, batchId: l.batchId },
      movementType: "TRANSFER_OUT",
      quantity: l.quantity.negated(),
      reference: reference(l.id),
    },
    {
      key: { skuId: l.sku.id, godownId: input.toGodownId, batchId: l.batchId },
      movementType: "TRANSFER_IN",
      quantity: l.quantity,
      reference: reference(l.id),
    },
  ]);
  const entries = await postMovements(tx, actor, movements);

  await tx.transferItem.createMany({
    data: lines.map((l, index) => ({
      id: l.id,
      transferId: transfer.id,
      skuId: l.sku.id,
      batchId: l.batchId,
      quantity: l.quantity,
      outEntryId: entries[index * 2].id,
      inEntryId: entries[index * 2 + 1].id,
    })),
  });

  await enqueueTallySync(tx, {
    entityType: "TRANSFER",
    entityId: transfer.id,
    entityNo: transferNumber,
    // Queue when either side syncs to Tally.
    godownId: (await anyTallyGodown(tx, input.fromGodownId, input.toGodownId)) ?? input.fromGodownId,
  });
  await recordAudit(tx, actor, {
    action: "TRANSFER_POSTED",
    entityType: "Transfer",
    entityId: transfer.id,
    newData: {
      transferNumber,
      lines: lines.map((l) => ({ sku: l.sku.code, batchId: l.batchId, quantity: l.quantity })),
    },
  });
  return transfer;
}

/** Ledger entries of the line an entry belongs to (both legs), for paired reversal. */
export async function transferLegEntryIds(tx: Tx, entry: InventoryLedger): Promise<string[]> {
  const item = await tx.transferItem.findFirstOrThrow({
    where: { OR: [{ outEntryId: entry.id }, { inEntryId: entry.id }] },
    select: { outEntryId: true, inEntryId: true },
  });
  return [item.outEntryId, item.inEntryId];
}

export async function onTransferEntriesReversed(tx: Tx, transferId: string): Promise<void> {
  const [total, reversed] = await Promise.all([
    tx.transferItem.count({ where: { transferId } }),
    tx.transferItem.count({ where: { transferId, outEntry: { reversedBy: { isNot: null } } } }),
  ]);
  await tx.transfer.update({ where: { id: transferId }, data: { status: derivePostedDocStatus(total, reversed) } });
}

async function anyTallyGodown(tx: Tx, ...godownIds: string[]): Promise<string | null> {
  const godown = await tx.godown.findFirst({
    where: { id: { in: godownIds }, tallySyncEnabled: true },
    select: { id: true },
  });
  return godown?.id ?? null;
}
