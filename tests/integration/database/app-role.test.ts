import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/server/db/client";
import { stockedScenario } from "../../helpers/scenario";

/**
 * Verifies the least-privilege application login (ops/postgres/app-role-grants.sql)
 * against the real database: row access works, destructive operations do not.
 */
const appUrl = process.env.APP_DATABASE_URL;
let app: PrismaClient;

beforeAll(async () => {
  if (!appUrl) return;
  await prisma.$executeRawUnsafe(readFileSync(join(process.cwd(), "ops/postgres/app-role-grants.sql"), "utf8"));
  app = new PrismaClient({ datasources: { db: { url: appUrl } } });
});

afterAll(async () => {
  await app?.$disconnect();
});

describe.skipIf(!appUrl)("least-privilege app login", () => {
  it("can read and lock ledger rows and write stock balances", async () => {
    const s = await stockedScenario("10");
    const [entry] = await app.$queryRaw<{ id: string }[]>`SELECT "id" FROM "inventory_ledger" LIMIT 1`;
    expect(entry).toBeDefined();

    await app.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "inventory_ledger" WHERE "id" = ${entry.id}::uuid FOR UPDATE`;
    });
    await expect(
      app.stockBalance.update({
        where: { skuId_godownId_batchId: { skuId: s.sku.id, godownId: s.godown.id, batchId: s.batch.id } },
        data: { updatedAt: new Date() },
      }),
    ).resolves.toBeDefined();
  });

  it("cannot delete, update or truncate the ledger and audit log", async () => {
    await stockedScenario("10");
    const denied = /permission denied/;

    await expect(app.$executeRaw`DELETE FROM "inventory_ledger"`).rejects.toThrow(denied);
    await expect(app.$executeRaw`UPDATE "inventory_ledger" SET "remarks" = 'x'`).rejects.toThrow(denied);
    await expect(app.$executeRawUnsafe(`TRUNCATE "inventory_ledger"`)).rejects.toThrow(denied);
    await expect(app.$executeRaw`DELETE FROM "audit_log"`).rejects.toThrow(denied);
    await expect(app.$executeRawUnsafe(`TRUNCATE "stock_balance"`)).rejects.toThrow(denied);
    await expect(app.$queryRaw`SELECT * FROM "_prisma_migrations"`).rejects.toThrow(denied);
  });
});
