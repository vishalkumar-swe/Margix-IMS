import type { OpeningBalance } from "@prisma/client";
import { istDateOf } from "@/lib/dates";
import type { OpeningLineCorrectionInput } from "@/lib/validation/opening";
import type { Actor } from "@/server/actor";
import { lockRowForUpdate } from "@/server/db/locks";
import { withTx, type Tx } from "@/server/db/transaction";
import { ConflictError, NotFoundError } from "@/server/errors";
import { recordAudit } from "@/server/modules/audit/audit.service";
import { postOpeningBalanceInTx } from "@/server/modules/opening/opening.service";
import { reverseEntryInTx } from "@/server/modules/reversals/reversals.service";

/**
 * Edit and delete for posted opening stock, done the ledger way: nothing is
 * overwritten. Delete reverses the line; edit posts the corrected line as a
 * new opening document linked to the one it replaces, then reverses the old
 * line — so stock updates at once and the history shows who changed what,
 * when and why.
 */

async function loadActiveLine(tx: Tx, itemId: string) {
  const item = await tx.openingBalanceItem.findUnique({
    where: { id: itemId },
    include: {
      openingBalance: true,
      batch: true,
      ledgerEntry: { select: { id: true, reversedBy: { select: { id: true } } } },
    },
  });
  if (!item) throw new NotFoundError("Opening stock line", itemId);
  // Document first, then the ledger entry (the system-wide lock order).
  await lockRowForUpdate(tx, "opening_balance", item.openingBalanceId);
  await lockRowForUpdate(tx, "inventory_ledger", item.ledgerEntryId);
  if (item.ledgerEntry.reversedBy) {
    throw new ConflictError("ALREADY_REVERSED", "This opening line has already been removed or corrected.");
  }
  return item;
}

/** Removes a posted opening line by reversing it. Refused if its stock has since been used. */
export function voidOpeningLine(actor: Actor, itemId: string, reason: string) {
  return withTx(async (tx) => {
    const item = await loadActiveLine(tx, itemId);
    return reverseEntryInTx(tx, actor, item.ledgerEntryId, `Opening line removed: ${reason}`);
  });
}

/**
 * Corrects a posted opening line (quantity, batch or dates). The corrected
 * line is posted first so that, for the same batch, stock never dips below
 * zero in between; if stock from the old line has since been dispatched from
 * a different batch, the reversal is refused with the available quantity.
 */
export function correctOpeningLine(
  actor: Actor,
  itemId: string,
  input: OpeningLineCorrectionInput,
): Promise<OpeningBalance> {
  return withTx(async (tx) => {
    const item = await loadActiveLine(tx, itemId);
    const original = item.openingBalance;

    const corrected = await postOpeningBalanceInTx(tx, actor, {
      godownId: original.godownId,
      asOf: istDateOf(original.asOf),
      remarks: `Correction of ${original.openingNumber}: ${input.reason}`,
      items: [
        {
          skuId: item.skuId,
          batchNumber: input.batchNumber,
          manufacturingDate: input.manufacturingDate,
          expiryDate: input.expiryDate,
          quantity: input.quantity,
        },
      ],
    });
    const correctedItem = await tx.openingBalanceItem.findFirstOrThrow({ where: { openingBalanceId: corrected.id } });
    await tx.openingBalanceItem.update({ where: { id: correctedItem.id }, data: { replacesItemId: item.id } });

    await reverseEntryInTx(tx, actor, item.ledgerEntryId, `Corrected by ${corrected.openingNumber}: ${input.reason}`);
    await recordAudit(tx, actor, {
      action: "OPENING_BALANCE_POSTED",
      entityType: "OpeningBalance",
      entityId: corrected.id,
      oldData: { openingNumber: original.openingNumber, batch: item.batch.batchNumber, quantity: item.quantity },
      newData: { openingNumber: corrected.openingNumber, correction: true, reason: input.reason, quantity: input.quantity },
    });
    return corrected;
  });
}
