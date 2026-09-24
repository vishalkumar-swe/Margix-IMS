import type { InventoryLedger } from "@prisma/client";
import { formatEntryNo } from "@/lib/format";
import type { Actor } from "@/server/actor";
import { lockRowForUpdate } from "@/server/db/locks";
import { withTx, type Tx } from "@/server/db/transaction";
import { NotFoundError } from "@/server/errors";
import { onAdjustmentEntryReversed } from "@/server/modules/adjustments/adjustments.service";
import { recordAudit } from "@/server/modules/audit/audit.service";
import { onDispatchEntryReversed } from "@/server/modules/dispatch/dispatch.service";
import { reverseLedgerEntry } from "@/server/modules/inventory/ledger.service";
import { onOpeningEntryReversed } from "@/server/modules/opening/opening.service";
import { onGrnEntryReversed } from "@/server/modules/purchasing/grn.service";
import { lockPurchaseOrder } from "@/server/modules/purchasing/purchase-order.service";
import { enqueueTallySync } from "@/server/modules/tally/tally-queue.service";

/**
 * Reversal use case (spec §6.4): posts the counter-entry and keeps the owning
 * document consistent (PO received quantities, document statuses), queues the
 * correction for Tally and audits who corrected what and why — atomically.
 *
 * Lock order: owning document → ledger entry → stock balance, matching the
 * order used when documents are posted, so reversals cannot deadlock with them.
 */
export function reverseEntry(actor: Actor, entryId: string, reason: string): Promise<InventoryLedger> {
  return withTx(async (tx) => {
    const target = await tx.inventoryLedger.findUnique({
      where: { id: entryId },
      select: { referenceType: true, referenceId: true },
    });
    if (!target) throw new NotFoundError("Ledger entry", entryId);
    await lockOwningDocument(tx, target.referenceType, target.referenceId);

    const { original, reversal } = await reverseLedgerEntry(tx, actor, entryId, reason);
    await applyDocumentEffects(tx, original);

    await enqueueTallySync(tx, {
      entityType: "REVERSAL",
      entityId: reversal.id,
      entityNo: formatEntryNo(reversal.entryNo),
      godownId: reversal.godownId,
    });
    await recordAudit(tx, actor, {
      action: "LEDGER_ENTRY_REVERSED",
      entityType: "InventoryLedger",
      entityId: original.id,
      newData: {
        reversedEntry: formatEntryNo(original.entryNo),
        reversalEntry: formatEntryNo(reversal.entryNo),
        reference: original.referenceNo,
        quantity: reversal.quantity,
        reason,
      },
    });
    return reversal;
  });
}

async function lockOwningDocument(tx: Tx, type: InventoryLedger["referenceType"], documentId: string): Promise<void> {
  switch (type) {
    case "GRN": {
      const grn = await tx.grn.findUniqueOrThrow({ where: { id: documentId }, select: { purchaseOrderId: true } });
      await lockPurchaseOrder(tx, grn.purchaseOrderId);
      await lockRowForUpdate(tx, "grn", documentId);
      return;
    }
    case "DISPATCH":
      await lockRowForUpdate(tx, "outward", documentId);
      return;
    case "OPENING_BALANCE":
      await lockRowForUpdate(tx, "opening_balance", documentId);
      return;
    case "ADJUSTMENT":
      await lockRowForUpdate(tx, "adjustment", documentId);
      return;
    default:
      throw new Error(`Reversal of ${type} entries is not supported yet.`);
  }
}

async function applyDocumentEffects(tx: Tx, original: InventoryLedger): Promise<void> {
  switch (original.referenceType) {
    case "GRN":
      return onGrnEntryReversed(tx, original);
    case "DISPATCH":
      return onDispatchEntryReversed(tx, original);
    case "OPENING_BALANCE":
      return onOpeningEntryReversed(tx, original);
    case "ADJUSTMENT":
      return onAdjustmentEntryReversed(tx, original);
    default:
      throw new Error(`Reversal of ${original.referenceType} entries is not supported yet.`);
  }
}
