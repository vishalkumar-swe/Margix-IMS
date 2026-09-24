import type { InventoryLedger, ReferenceType } from "@prisma/client";
import { formatEntryNo } from "@/lib/format";
import type { Actor } from "@/server/actor";
import { lockRowForUpdate } from "@/server/db/locks";
import { withTx, type Tx } from "@/server/db/transaction";
import { NotFoundError } from "@/server/errors";
import { onAdjustmentEntryReversed } from "@/server/modules/adjustments/adjustments.service";
import { recordAudit } from "@/server/modules/audit/audit.service";
import { onDispatchEntryReversed } from "@/server/modules/dispatch/dispatch.service";
import { reverseLedgerEntries } from "@/server/modules/inventory/ledger.service";
import { lockInvoice } from "@/server/modules/invoices/invoice.service";
import { onOpeningEntryReversed } from "@/server/modules/opening/opening.service";
import { onGrnEntryReversed } from "@/server/modules/purchasing/grn.service";
import { lockPurchaseOrder } from "@/server/modules/purchasing/purchase-order.service";
import { onPurchaseReturnEntryReversed } from "@/server/modules/returns/purchase-return.service";
import { onSalesReturnEntryReversed } from "@/server/modules/returns/sales-return.service";
import { enqueueTallySync } from "@/server/modules/tally/tally-queue.service";
import { onTransferEntriesReversed, transferLegEntryIds } from "@/server/modules/transfers/transfer.service";

/**
 * Reversal use case (spec §6.4): posts the counter-entry and keeps the owning
 * document consistent (PO received and invoice dispatched quantities, return
 * balances, document statuses), queues the correction for Tally and audits
 * who corrected what and why — atomically.
 *
 * A transfer moves stock between two godowns, so reversing either leg
 * reverses both; stock is never left half-moved.
 *
 * Lock order: owning document(s) → ledger entries → stock balances, matching
 * the order used when documents are posted, so reversals cannot deadlock with them.
 */
export function reverseEntry(actor: Actor, entryId: string, reason: string): Promise<InventoryLedger> {
  return withTx((tx) => reverseEntryInTx(tx, actor, entryId, reason));
}

/** reverseEntry inside the caller's transaction (e.g. as part of a correction). */
export async function reverseEntryInTx(tx: Tx, actor: Actor, entryId: string, reason: string): Promise<InventoryLedger> {
  const target = await tx.inventoryLedger.findUnique({ where: { id: entryId } });
  if (!target) throw new NotFoundError("Ledger entry", entryId);
  await lockOwningDocuments(tx, target.referenceType, target.referenceId);

  const entryIds =
    target.referenceType === "TRANSFER" && target.movementType !== "REVERSAL"
      ? await transferLegEntryIds(tx, target)
      : [entryId];
  const results = await reverseLedgerEntries(tx, actor, entryIds, reason);

  for (const { original } of results) await applyDocumentEffects(tx, original);
  if (target.referenceType === "TRANSFER") await onTransferEntriesReversed(tx, target.referenceId);

  for (const { reversal } of results) {
    await enqueueTallySync(tx, {
      entityType: "REVERSAL",
      entityId: reversal.id,
      entityNo: formatEntryNo(reversal.entryNo),
      godownId: reversal.godownId,
    });
  }
  await recordAudit(tx, actor, {
    action: "LEDGER_ENTRY_REVERSED",
    entityType: "InventoryLedger",
    entityId: target.id,
    newData: {
      reference: target.referenceNo,
      reason,
      entries: results.map(({ original, reversal }) => ({
        reversed: formatEntryNo(original.entryNo),
        reversal: formatEntryNo(reversal.entryNo),
        quantity: reversal.quantity,
      })),
    },
  });

  return results.find((r) => r.original.id === entryId)!.reversal;
}

async function lockOwningDocuments(tx: Tx, type: ReferenceType, documentId: string): Promise<void> {
  switch (type) {
    case "GRN": {
      const grn = await tx.grn.findUniqueOrThrow({ where: { id: documentId }, select: { purchaseOrderId: true } });
      await lockPurchaseOrder(tx, grn.purchaseOrderId);
      await lockRowForUpdate(tx, "grn", documentId);
      return;
    }
    case "DISPATCH": {
      const outward = await tx.outward.findUniqueOrThrow({ where: { id: documentId }, select: { invoiceId: true } });
      if (outward.invoiceId) await lockInvoice(tx, outward.invoiceId);
      await lockRowForUpdate(tx, "outward", documentId);
      return;
    }
    case "SALES_RETURN": {
      const sr = await tx.salesReturn.findUniqueOrThrow({ where: { id: documentId }, select: { outwardId: true } });
      await lockRowForUpdate(tx, "outward", sr.outwardId);
      await lockRowForUpdate(tx, "sales_return", documentId);
      return;
    }
    case "PURCHASE_RETURN": {
      const pr = await tx.purchaseReturn.findUniqueOrThrow({
        where: { id: documentId },
        select: { grn: { select: { id: true, purchaseOrderId: true } } },
      });
      await lockPurchaseOrder(tx, pr.grn.purchaseOrderId);
      await lockRowForUpdate(tx, "grn", pr.grn.id);
      await lockRowForUpdate(tx, "purchase_return", documentId);
      return;
    }
    case "TRANSFER":
      await lockRowForUpdate(tx, "transfer", documentId);
      return;
    case "OPENING_BALANCE":
      await lockRowForUpdate(tx, "opening_balance", documentId);
      return;
    case "ADJUSTMENT":
      await lockRowForUpdate(tx, "adjustment", documentId);
      return;
  }
}

async function applyDocumentEffects(tx: Tx, original: InventoryLedger): Promise<void> {
  switch (original.referenceType) {
    case "GRN":
      return onGrnEntryReversed(tx, original);
    case "DISPATCH":
      return onDispatchEntryReversed(tx, original);
    case "SALES_RETURN":
      return onSalesReturnEntryReversed(tx, original);
    case "PURCHASE_RETURN":
      return onPurchaseReturnEntryReversed(tx, original);
    case "OPENING_BALANCE":
      return onOpeningEntryReversed(tx, original);
    case "ADJUSTMENT":
      return onAdjustmentEntryReversed(tx, original);
    case "TRANSFER":
      return; // Document status is updated once for both legs by the caller.
  }
}
