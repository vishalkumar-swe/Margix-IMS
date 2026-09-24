import type { InventoryLedger } from "@prisma/client";
import type { Actor } from "@/server/actor";
import type { Tx } from "@/server/db/transaction";
import { lockRowForUpdate } from "@/server/db/locks";
import { isUniqueViolation } from "@/server/db/pg-error";
import { ConflictError, NotFoundError } from "@/server/errors";
import { evaluateStockAlerts } from "@/server/modules/alerts/alerts.service";
import type { PostMovementInput, StockKey } from "./inventory.types";
import { assertQuantitySign } from "./movement-rules";
import { applyStockDelta } from "./stock-balance";

/**
 * The inventory engine's write API. These functions are the ONLY code paths
 * that change stock: each posts immutable ledger entries, updates the
 * stock_balance projection and re-evaluates low-stock alerts, all inside the
 * caller's transaction.
 */

/** Posts one immutable ledger entry. */
export async function postMovement(tx: Tx, actor: Actor, input: PostMovementInput): Promise<InventoryLedger> {
  const [entry] = await postMovements(tx, actor, [input]);
  return entry;
}

/**
 * Posts several movements. Stock rows are locked in a deterministic key order
 * to prevent deadlocks between concurrent multi-line documents; the result is
 * returned in input order.
 */
export async function postMovements(
  tx: Tx,
  actor: Actor,
  inputs: PostMovementInput[],
): Promise<InventoryLedger[]> {
  const order = inputs
    .map((input, index) => ({ input, index }))
    .sort((a, b) => compareKeys(a.input.key, b.input.key) || a.index - b.index);

  const results = new Array<InventoryLedger>(inputs.length);
  for (const { input, index } of order) {
    results[index] = await insertMovement(tx, actor, input);
  }
  await evaluateStockAlerts(
    tx,
    inputs.map((i) => i.key),
  );
  return results;
}

/**
 * Posts a REVERSAL that exactly counter-balances `entryId` (spec §6.4). The
 * original entry stays untouched. A unique constraint on reverses_entry_id
 * guarantees an entry can be reversed at most once, even under concurrency.
 * Document-level side effects are handled by the reversals module.
 */
export async function reverseLedgerEntry(
  tx: Tx,
  actor: Actor,
  entryId: string,
  reason: string,
): Promise<{ original: InventoryLedger; reversal: InventoryLedger }> {
  const [result] = await reverseLedgerEntries(tx, actor, [entryId], reason);
  return result;
}

/**
 * Reverses several entries atomically (e.g. both legs of a transfer), taking
 * stock locks in key order like postMovements. Results follow input order.
 */
export async function reverseLedgerEntries(
  tx: Tx,
  actor: Actor,
  entryIds: string[],
  reason: string,
): Promise<{ original: InventoryLedger; reversal: InventoryLedger }[]> {
  const originals: InventoryLedger[] = [];
  for (const entryId of entryIds) originals.push(await loadReversible(tx, entryId));

  const order = originals
    .map((original, index) => ({ original, index }))
    .sort((a, b) => compareKeys(a.original, b.original) || a.index - b.index);

  const results = new Array<{ original: InventoryLedger; reversal: InventoryLedger }>(originals.length);
  for (const { original, index } of order) {
    results[index] = { original, reversal: await insertReversal(tx, actor, original, reason) };
  }
  await evaluateStockAlerts(tx, originals);
  return results;
}

async function insertMovement(tx: Tx, actor: Actor, input: PostMovementInput): Promise<InventoryLedger> {
  assertQuantitySign(input.movementType, input.quantity);
  const balanceAfter = await applyStockDelta(tx, input.key, input.quantity);

  return tx.inventoryLedger.create({
    data: {
      skuId: input.key.skuId,
      godownId: input.key.godownId,
      batchId: input.key.batchId,
      movementType: input.movementType,
      quantity: input.quantity,
      balanceAfter,
      referenceType: input.reference.type,
      referenceId: input.reference.id,
      referenceNo: input.reference.no,
      referenceLineId: input.reference.lineId ?? null,
      reasonCode: input.reasonCode ?? null,
      remarks: input.remarks ?? null,
      createdById: actor.userId,
    },
  });
}

async function loadReversible(tx: Tx, entryId: string): Promise<InventoryLedger> {
  // Row lock (not a write, so the append-only trigger does not fire) serialises
  // concurrent reversals of the same entry; the loser then sees ALREADY_REVERSED.
  if (!(await lockRowForUpdate(tx, "inventory_ledger", entryId))) {
    throw new NotFoundError("Ledger entry", entryId);
  }

  const original = await tx.inventoryLedger.findUniqueOrThrow({ where: { id: entryId } });
  if (original.movementType === "REVERSAL") {
    throw new ConflictError("CANNOT_REVERSE", "A reversal entry cannot itself be reversed.");
  }
  const existingReversal = await tx.inventoryLedger.findUnique({
    where: { reversesEntryId: original.id },
    select: { id: true },
  });
  if (existingReversal) {
    throw new ConflictError("ALREADY_REVERSED", "This ledger entry has already been reversed.");
  }
  return original;
}

async function insertReversal(
  tx: Tx,
  actor: Actor,
  original: InventoryLedger,
  reason: string,
): Promise<InventoryLedger> {
  const key: StockKey = { skuId: original.skuId, godownId: original.godownId, batchId: original.batchId };
  const quantity = original.quantity.negated();
  const balanceAfter = await applyStockDelta(tx, key, quantity);

  try {
    return await tx.inventoryLedger.create({
      data: {
        ...key,
        movementType: "REVERSAL",
        quantity,
        balanceAfter,
        referenceType: original.referenceType,
        referenceId: original.referenceId,
        referenceNo: original.referenceNo,
        referenceLineId: original.referenceLineId,
        reasonCode: original.reasonCode,
        remarks: reason,
        reversesEntryId: original.id,
        createdById: actor.userId,
      },
    });
  } catch (error) {
    if (isUniqueViolation(error, "reverses_entry_id")) {
      throw new ConflictError("ALREADY_REVERSED", "This ledger entry has already been reversed.");
    }
    throw error;
  }
}

function compareKeys(a: StockKey, b: StockKey): number {
  return a.skuId.localeCompare(b.skuId) || a.godownId.localeCompare(b.godownId) || a.batchId.localeCompare(b.batchId);
}
