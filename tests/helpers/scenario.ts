import type { Batch, Godown, Sku } from "@prisma/client";
import type { Actor } from "@/server/actor";
import { prisma } from "@/server/db/client";
import { postOpeningBalance } from "@/server/modules/opening/opening.service";
import { actorFor, createGodown, createSku, createUser } from "./factories";

export interface StockedScenario {
  admin: Actor;
  manager: Actor;
  operator: Actor;
  sku: Sku;
  godown: Godown;
  batch: Batch;
}

/** Common starting point: one SKU with `quantity` in batch B-1 of one godown, plus one user per role. */
export async function stockedScenario(quantity = "100"): Promise<StockedScenario> {
  const admin = actorFor(await createUser("ADMIN"));
  const manager = actorFor(await createUser("STORE_MANAGER"));
  const operator = actorFor(await createUser("WAREHOUSE_OPERATOR"));
  const sku = await createSku();
  const godown = await createGodown();
  await postOpeningBalance(admin, {
    godownId: godown.id,
    asOf: "2026-04-01",
    items: [{ skuId: sku.id, batchNumber: "B-1", quantity }],
  });
  const batch = await prisma.batch.findFirstOrThrow({ where: { skuId: sku.id, batchNumber: "B-1" } });
  return { admin, manager, operator, sku, godown, batch };
}

export async function stockOf(skuId: string, godownId: string, batchId: string): Promise<string> {
  const row = await prisma.stockBalance.findUnique({
    where: { skuId_godownId_batchId: { skuId, godownId, batchId } },
  });
  return row ? row.quantity.toString() : "0";
}

/** Test helper: resolves to the AppError code, or "OK" when the promise succeeds. */
export const errorCode = (p: Promise<unknown>) => p.then(() => "OK", (e: { code?: string }) => e.code ?? String(e));
