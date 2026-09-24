import { Prisma } from "@prisma/client";
import type { Tx } from "./transaction";

/** Tables whose rows are locked as the "document lock" of a business operation. */
export type LockableTable =
  | "purchase_order"
  | "grn"
  | "outward"
  | "opening_balance"
  | "adjustment"
  | "inventory_ledger";

/**
 * `SELECT … FOR UPDATE` on one row, held until the transaction ends.
 *
 * Lock order convention (prevents deadlocks): document row first, then
 * ledger entry, then stock_balance rows (sorted by key).
 *
 * @returns false when the row does not exist.
 */
export async function lockRowForUpdate(tx: Tx, table: LockableTable, id: string): Promise<boolean> {
  const rows = await tx.$queryRaw<{ id: string }[]>(
    Prisma.sql`SELECT "id" FROM ${Prisma.raw(`"${table}"`)} WHERE "id" = ${id}::uuid FOR UPDATE`,
  );
  return rows.length > 0;
}
