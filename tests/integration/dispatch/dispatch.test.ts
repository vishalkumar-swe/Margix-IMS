import type { Batch, Sku } from "@prisma/client";
import { beforeEach, describe, expect, it } from "vitest";
import type { Actor } from "@/server/actor";
import { prisma } from "@/server/db/client";
import type { AppError } from "@/server/errors";
import { postDispatch } from "@/server/modules/dispatch/dispatch.service";
import { postOpeningBalance } from "@/server/modules/opening/opening.service";
import { reverseEntry } from "@/server/modules/reversals/reversals.service";
import { actorFor, createBatch, createGodown, createSku, createUser } from "../../helpers/factories";

let admin: Actor;
let operator: Actor;
let skuA: Sku;
let skuB: Sku;
let godownId: string;
let batchA: Batch;
let batchB: Batch;

beforeEach(async () => {
  admin = actorFor(await createUser("ADMIN"));
  operator = actorFor(await createUser("WAREHOUSE_OPERATOR"));
  skuA = await createSku();
  skuB = await createSku();
  godownId = (await createGodown()).id;
  await postOpeningBalance(admin, {
    godownId,
    asOf: "2026-04-01",
    items: [
      { skuId: skuA.id, batchNumber: "A-1", quantity: "50" },
      { skuId: skuB.id, batchNumber: "B-1", quantity: "10" },
    ],
  });
  batchA = await prisma.batch.findFirstOrThrow({ where: { skuId: skuA.id } });
  batchB = await prisma.batch.findFirstOrThrow({ where: { skuId: skuB.id } });
});

const errorCode = (p: Promise<unknown>) => p.then(() => "OK", (e: AppError) => e.code);

describe("dispatch", () => {
  it("is all-or-nothing across lines", async () => {
    const result = postDispatch(operator, {
      godownId,
      items: [
        { skuId: skuA.id, batchId: batchA.id, quantity: "20" },
        { skuId: skuB.id, batchId: batchB.id, quantity: "11" },
      ],
    });
    expect(await errorCode(result)).toBe("INSUFFICIENT_STOCK");
    expect(await prisma.outward.count()).toBe(0);
    expect(await prisma.inventoryLedger.count({ where: { movementType: "OUTWARD" } })).toBe(0);
  });

  it("rejects a batch that belongs to another SKU", async () => {
    const result = postDispatch(operator, {
      godownId,
      items: [{ skuId: skuA.id, batchId: batchB.id, quantity: "1" }],
    });
    expect(await errorCode(result)).toBe("NOT_FOUND");
  });

  it("rejects dispatch from a godown without that batch", async () => {
    const otherGodown = await createGodown();
    const result = postDispatch(operator, {
      godownId: otherGodown.id,
      items: [{ skuId: skuA.id, batchId: batchA.id, quantity: "1" }],
    });
    expect(await errorCode(result)).toBe("INSUFFICIENT_STOCK");
  });

  it("rejects archived SKUs", async () => {
    const archived = await createSku({ status: "ARCHIVED" });
    const batch = await createBatch(archived.id);
    const result = postDispatch(operator, {
      godownId,
      items: [{ skuId: archived.id, batchId: batch.id, quantity: "1" }],
    });
    expect(await errorCode(result)).toBe("VALIDATION_ERROR");
  });

  it("tracks partial reversal on the document", async () => {
    const outward = await postDispatch(operator, {
      godownId,
      items: [
        { skuId: skuA.id, batchId: batchA.id, quantity: "5" },
        { skuId: skuB.id, batchId: batchB.id, quantity: "5" },
      ],
    });
    const [first] = await prisma.outwardItem.findMany({ where: { outwardId: outward.id }, orderBy: { skuId: "asc" } });

    await reverseEntry(admin, first.ledgerEntryId, "Wrong batch picked");
    expect((await prisma.outward.findUniqueOrThrow({ where: { id: outward.id } })).status).toBe("PARTIALLY_REVERSED");
  });
});
