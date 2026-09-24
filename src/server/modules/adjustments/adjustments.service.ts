import type { Adjustment, InventoryLedger } from "@prisma/client";
import type { AdjustmentCreateInput } from "@/lib/validation/adjustments";
import type { Actor } from "@/server/actor";
import { prisma } from "@/server/db/client";
import { toDecimal } from "@/server/db/decimal";
import { lockRowForUpdate } from "@/server/db/locks";
import { withTx, type Tx } from "@/server/db/transaction";
import { ConflictError, ForbiddenError, NotFoundError } from "@/server/errors";
import { recordAudit } from "@/server/modules/audit/audit.service";
import { nextDocumentNumber, withIdempotency } from "@/server/modules/documents/documents.service";
import { getBatchForSku, resolveBatch } from "@/server/modules/inventory/batch.service";
import { postMovements } from "@/server/modules/inventory/ledger.service";
import { assertUomPrecision } from "@/server/modules/inventory/movement-rules";
import { assertStockAvailable } from "@/server/modules/inventory/stock.queries";
import { loadActiveGodown, loadTransactableSkus } from "@/server/modules/masters/masters.queries";
import { enqueueTallySync } from "@/server/modules/tally/tally-queue.service";

/**
 * Stock adjustments (spec §6.3). Staff submit a request; a different user with
 * approval rights approves it, which posts signed ADJUSTMENT entries. The
 * person who finds a discrepancy never authorises its correction (enforced
 * here and by a DB CHECK).
 */

export function createAdjustment(actor: Actor, input: AdjustmentCreateInput): Promise<Adjustment> {
  return withIdempotency(
    input.idempotencyKey,
    (key) => prisma.adjustment.findUnique({ where: { idempotencyKey: key } }),
    () =>
      withTx(async (tx) => {
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

          const batch = item.batchId
            ? await getBatchForSku(tx, item.skuId, item.batchId)
            : await resolveBatch(tx, sku, { batchNumber: item.batchNumber });

          if (quantity.isNegative()) {
            // Fail early; the authoritative check repeats atomically on approval.
            await assertStockAvailable(
              tx,
              { skuId: sku.id, godownId: input.godownId, batchId: batch.id },
              quantity.negated(),
            );
          }
          lines.push({ skuId: sku.id, batchId: batch.id, quantity });
        }

        const now = new Date();
        const adjustment = await tx.adjustment.create({
          data: {
            adjustmentNumber: await nextDocumentNumber(tx, "ADJ"),
            godownId: input.godownId,
            reasonCode: input.reasonCode,
            reasonNote: input.reasonNote,
            status: "SUBMITTED",
            idempotencyKey: input.idempotencyKey,
            createdById: actor.userId,
            submittedById: actor.userId,
            submittedAt: now,
            items: { create: lines },
          },
          include: { items: true },
        });
        await recordAudit(tx, actor, {
          action: "ADJUSTMENT_SUBMITTED",
          entityType: "Adjustment",
          entityId: adjustment.id,
          newData: adjustment,
        });
        return adjustment;
      }),
  );
}

/** Approves a SUBMITTED adjustment and posts its ledger entries atomically. */
export function approveAdjustment(actor: Actor, id: string, note?: string): Promise<Adjustment> {
  return withTx(async (tx) => {
    const adjustment = await lockForReview(tx, actor, id);

    const entries = await postMovements(
      tx,
      actor,
      adjustment.items.map((item) => ({
        key: { skuId: item.skuId, godownId: adjustment.godownId, batchId: item.batchId },
        movementType: "ADJUSTMENT",
        quantity: item.quantity,
        reference: { type: "ADJUSTMENT", id: adjustment.id, no: adjustment.adjustmentNumber, lineId: item.id },
        reasonCode: adjustment.reasonCode,
        remarks: adjustment.reasonNote,
      })),
    );
    for (const [index, item] of adjustment.items.entries()) {
      await tx.adjustmentItem.update({ where: { id: item.id }, data: { ledgerEntryId: entries[index].id } });
    }

    const approved = await tx.adjustment.update({
      where: { id },
      data: { status: "APPROVED", reviewedById: actor.userId, reviewedAt: new Date(), reviewNote: note ?? null },
    });
    await enqueueTallySync(tx, {
      entityType: "ADJUSTMENT",
      entityId: id,
      entityNo: adjustment.adjustmentNumber,
      godownId: adjustment.godownId,
    });
    await recordAudit(tx, actor, {
      action: "ADJUSTMENT_APPROVED",
      entityType: "Adjustment",
      entityId: id,
      newData: { adjustmentNumber: adjustment.adjustmentNumber, note: note ?? null, entries: entries.map((e) => e.id) },
    });
    return approved;
  });
}

export function rejectAdjustment(actor: Actor, id: string, note: string): Promise<Adjustment> {
  return withTx(async (tx) => {
    const adjustment = await lockForReview(tx, actor, id);
    const rejected = await tx.adjustment.update({
      where: { id },
      data: { status: "REJECTED", reviewedById: actor.userId, reviewedAt: new Date(), reviewNote: note },
    });
    await recordAudit(tx, actor, {
      action: "ADJUSTMENT_REJECTED",
      entityType: "Adjustment",
      entityId: id,
      newData: { adjustmentNumber: adjustment.adjustmentNumber, note },
    });
    return rejected;
  });
}

/** Marks the adjustment REVERSED once every one of its entries has been reversed. */
export async function onAdjustmentEntryReversed(tx: Tx, entry: InventoryLedger): Promise<void> {
  const item = await tx.adjustmentItem.findUniqueOrThrow({ where: { ledgerEntryId: entry.id } });
  const remaining = await tx.adjustmentItem.count({
    where: { adjustmentId: item.adjustmentId, ledgerEntry: { reversedBy: { is: null } } },
  });
  if (remaining === 0) {
    await tx.adjustment.update({ where: { id: item.adjustmentId }, data: { status: "REVERSED" } });
  }
}

async function lockForReview(tx: Tx, actor: Actor, id: string) {
  if (!(await lockRowForUpdate(tx, "adjustment", id))) throw new NotFoundError("Adjustment", id);
  const adjustment = await tx.adjustment.findUniqueOrThrow({
    where: { id },
    include: { items: { orderBy: { id: "asc" } } },
  });

  if (adjustment.status !== "SUBMITTED") {
    throw new ConflictError(
      "INVALID_STATE",
      `${adjustment.adjustmentNumber} has already been ${adjustment.status.toLowerCase()}.`,
    );
  }
  if (adjustment.submittedById === actor.userId) {
    throw new ForbiddenError(
      "You submitted this adjustment, so another authorised user must review it.",
      "MAKER_CHECKER_VIOLATION",
    );
  }
  return adjustment;
}
