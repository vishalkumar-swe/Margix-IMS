import type { Tx } from "@/server/db/transaction";
import { toDecimal, type Decimal } from "@/server/db/decimal";
import type { StockKey } from "./inventory.types";
import { buildInsufficientStockError } from "./stock.queries";

/**
 * Applies a signed delta to the stock_balance projection and returns the new
 * balance. Internal to the inventory module — only ledger posting may call it.
 *
 * Concurrency: a decrease is a single conditional UPDATE. Postgres re-evaluates
 * the `quantity + delta >= 0` predicate after acquiring the row lock, so
 * concurrent dispatches against the same batch serialise correctly and can
 * never drive stock negative.
 */
export async function applyStockDelta(tx: Tx, key: StockKey, delta: Decimal): Promise<Decimal> {
  const amount = delta.toString();

  if (delta.isPositive()) {
    const rows = await tx.$queryRaw<{ quantity: Decimal }[]>`
      INSERT INTO "stock_balance" ("sku_id", "godown_id", "batch_id", "quantity", "updated_at")
      VALUES (${key.skuId}::uuid, ${key.godownId}::uuid, ${key.batchId}::uuid, ${amount}::numeric, now())
      ON CONFLICT ("sku_id", "godown_id", "batch_id")
      DO UPDATE SET "quantity" = "stock_balance"."quantity" + EXCLUDED."quantity", "updated_at" = now()
      RETURNING "quantity"`;
    return toDecimal(rows[0].quantity);
  }

  const rows = await tx.$queryRaw<{ quantity: Decimal }[]>`
    UPDATE "stock_balance"
    SET "quantity" = "quantity" + ${amount}::numeric, "updated_at" = now()
    WHERE "sku_id" = ${key.skuId}::uuid
      AND "godown_id" = ${key.godownId}::uuid
      AND "batch_id" = ${key.batchId}::uuid
      AND "quantity" + ${amount}::numeric >= 0
    RETURNING "quantity"`;

  if (rows.length === 0) {
    throw await buildInsufficientStockError(tx, key, delta.negated());
  }
  return toDecimal(rows[0].quantity);
}
