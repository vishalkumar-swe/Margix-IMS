import { randomUUID } from "node:crypto";
import type { InventoryLedger, OpeningBalance } from "@prisma/client";
import { dateOnlyToUtc } from "@/lib/dates";
import type { OpeningCreateInput } from "@/lib/validation/opening";
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
import { resolveBatch } from "@/server/modules/inventory/batch.service";
import { postMovements } from "@/server/modules/inventory/ledger.service";
import { assertUomPrecision } from "@/server/modules/inventory/movement-rules";
import { loadActiveGodown, loadTransactableSkus } from "@/server/modules/masters/masters.queries";
import { enqueueTallySync } from "@/server/modules/tally/tally-queue.service";

/** Posts opening stock for a godown (go-live balances), one OPENING entry per line. */
export function postOpeningBalance(actor: Actor, input: OpeningCreateInput): Promise<OpeningBalance> {
  return withIdempotency(
    input.idempotencyKey,
    (key) => prisma.openingBalance.findUnique({ where: { idempotencyKey: key } }),
    () => withTx((tx) => postOpeningBalanceInTx(tx, actor, input)),
  );
}

/** Posts an opening balance inside the caller's transaction (used by bulk import). */
export async function postOpeningBalanceInTx(
  tx: Tx,
  actor: Actor,
  input: OpeningCreateInput,
): Promise<OpeningBalance> {
  await loadActiveGodown(tx, input.godownId);
  const skus = await loadTransactableSkus(
    tx,
    input.items.map((i) => i.skuId),
  );

  const lines = [];
  for (const item of input.items) {
    const sku = skus.get(item.skuId)!;
    const quantity = toDecimal(item.quantity);
    assertUomPrecision(quantity, sku);
    const batch = await resolveBatch(tx, sku, {
      batchNumber: item.batchNumber,
      manufacturingDate: item.manufacturingDate ? dateOnlyToUtc(item.manufacturingDate) : null,
      expiryDate: item.expiryDate ? dateOnlyToUtc(item.expiryDate) : null,
    });
    lines.push({ id: randomUUID(), sku, batch, quantity });
  }

  const openingNumber = await nextDocumentNumber(tx, "OPN");
  const opening = await tx.openingBalance.create({
    data: {
      openingNumber,
      godownId: input.godownId,
      asOf: dateOnlyToUtc(input.asOf),
      remarks: input.remarks,
      idempotencyKey: input.idempotencyKey,
      createdById: actor.userId,
    },
  });

  const entries = await postMovements(
    tx,
    actor,
    lines.map((l) => ({
      key: { skuId: l.sku.id, godownId: input.godownId, batchId: l.batch.id },
      movementType: "OPENING",
      quantity: l.quantity,
      reference: { type: "OPENING_BALANCE", id: opening.id, no: openingNumber, lineId: l.id },
    })),
  );

  await tx.openingBalanceItem.createMany({
    data: lines.map((l, index) => ({
      id: l.id,
      openingBalanceId: opening.id,
      skuId: l.sku.id,
      batchId: l.batch.id,
      quantity: l.quantity,
      ledgerEntryId: entries[index].id,
    })),
  });

  await enqueueTallySync(tx, {
    entityType: "OPENING_BALANCE",
    entityId: opening.id,
    entityNo: openingNumber,
    godownId: input.godownId,
  });
  await recordAudit(tx, actor, {
    action: "OPENING_BALANCE_POSTED",
    entityType: "OpeningBalance",
    entityId: opening.id,
    newData: {
      openingNumber,
      lines: lines.map((l) => ({ sku: l.sku.code, batch: l.batch.batchNumber, quantity: l.quantity })),
    },
  });
  return opening;
}

export async function onOpeningEntryReversed(tx: Tx, entry: InventoryLedger): Promise<void> {
  const item = await tx.openingBalanceItem.findUniqueOrThrow({ where: { ledgerEntryId: entry.id } });
  const [total, reversed] = await Promise.all([
    tx.openingBalanceItem.count({ where: { openingBalanceId: item.openingBalanceId } }),
    tx.openingBalanceItem.count({
      where: { openingBalanceId: item.openingBalanceId, ledgerEntry: { reversedBy: { isNot: null } } },
    }),
  ]);
  await tx.openingBalance.update({
    where: { id: item.openingBalanceId },
    data: { status: derivePostedDocStatus(total, reversed) },
  });
}
