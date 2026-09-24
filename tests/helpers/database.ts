import { Prisma } from "@prisma/client";
import { prisma } from "@/server/db/client";

let tableNames: string[] | undefined;

/**
 * Empties every table between tests.
 *
 * Uses DELETE with `session_replication_role = replica`, which suspends
 * triggers (the append-only guards and FK checks) for this transaction only.
 * This is much faster than TRUNCATE, which rewrites every table file. Test
 * database only: the role requires superuser rights the app never uses.
 */
export async function resetDatabase(): Promise<void> {
  tableNames ??= (
    await prisma.$queryRaw<{ tablename: string }[]>`
      SELECT tablename FROM pg_tables
      WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`
  ).map((row) => row.tablename);

  await prisma.$transaction([
    prisma.$executeRawUnsafe(`SET LOCAL session_replication_role = replica`),
    ...tableNames.map((name) => prisma.$executeRawUnsafe(`DELETE FROM "${name}"`)),
    prisma.$executeRawUnsafe(`ALTER SEQUENCE "inventory_ledger_entry_no_seq" RESTART`),
  ]);
}

/** Rows where the stock_balance projection disagrees with the ledger (must be empty). */
export async function findStockDrift(): Promise<unknown[]> {
  return prisma.$queryRaw<unknown[]>(Prisma.sql`SELECT * FROM "v_stock_balance_drift"`);
}
