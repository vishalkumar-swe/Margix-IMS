/**
 * Applies ops/postgres/app-role-grants.sql as the schema owner
 * (DIRECT_DATABASE_URL). Idempotent; run after migrate/reset:
 *   npm run db:grants
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";

async function main() {
  const url = process.env.DIRECT_DATABASE_URL;
  if (!url) throw new Error("DIRECT_DATABASE_URL (schema owner) is required.");

  const prisma = new PrismaClient({ datasources: { db: { url } } });
  try {
    const sql = readFileSync(join(process.cwd(), "ops/postgres/app-role-grants.sql"), "utf8");
    await prisma.$executeRawUnsafe(sql);
    console.log("Application role grants applied.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
