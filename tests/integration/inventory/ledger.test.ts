import { randomUUID } from "node:crypto";
import type { Batch, Godown, Sku } from "@prisma/client";
import { beforeEach, describe, expect, it } from "vitest";
import type { Actor } from "@/server/actor";
import { prisma } from "@/server/db/client";
import { toDecimal } from "@/server/db/decimal";
import { withTx } from "@/server/db/transaction";
import { AppError, InsufficientStockError } from "@/server/errors";
import type { PostMovementInput } from "@/server/modules/inventory/inventory.types";
import { postMovement, reverseLedgerEntry } from "@/server/modules/inventory/ledger.service";
import { findStockDrift } from "../../helpers/database";
import { actorFor, createBatch, createGodown, createSku, createUser } from "../../helpers/factories";

let actor: Actor;
let sku: Sku;
let godown: Godown;
let batch: Batch;

beforeEach(async () => {
  actor = actorFor(await createUser("ADMIN"));
  sku = await createSku();
  godown = await createGodown();
  batch = await createBatch(sku.id);
});

function movement(
  movementType: PostMovementInput["movementType"],
  quantity: string,
  extra: Partial<PostMovementInput> = {},
): PostMovementInput {
  return {
    key: { skuId: sku.id, godownId: godown.id, batchId: batch.id },
    movementType,
    quantity: toDecimal(quantity),
    reference: { type: "OPENING_BALANCE", id: randomUUID(), no: "TEST-1" },
    reasonCode: movementType === "ADJUSTMENT" ? "DAMAGE" : null,
    ...extra,
  };
}

const post = (input: PostMovementInput) => withTx((tx) => postMovement(tx, actor, input));
const reverse = (entryId: string) => withTx((tx) => reverseLedgerEntry(tx, actor, entryId, "test correction"));

async function balance(): Promise<string> {
  const row = await prisma.stockBalance.findUnique({
    where: { skuId_godownId_batchId: { skuId: sku.id, godownId: godown.id, batchId: batch.id } },
  });
  return row ? row.quantity.toString() : "0";
}

async function expectAppError(promise: Promise<unknown>, code: string): Promise<AppError> {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(AppError);
  expect((error as AppError).code).toBe(code);
  return error as AppError;
}

describe("ledger posting", () => {
  it("keeps signed quantities and a running balance per SKU + godown + batch", async () => {
    const opening = await post(movement("OPENING", "500"));
    const inward = await post(movement("INWARD", "300"));
    const outward = await post(movement("OUTWARD", "-200"));
    const adjustment = await post(movement("ADJUSTMENT", "-25"));

    expect(opening.balanceAfter.toString()).toBe("500");
    expect(inward.balanceAfter.toString()).toBe("800");
    expect(outward.quantity.toString()).toBe("-200");
    expect(outward.balanceAfter.toString()).toBe("600");
    expect(adjustment.balanceAfter.toString()).toBe("575");
    expect(await balance()).toBe("575");
    expect(await findStockDrift()).toEqual([]);
  });

  it("keeps decimal quantities exact", async () => {
    await post(movement("INWARD", "0.1"));
    await post(movement("INWARD", "0.2"));
    expect(await balance()).toBe("0.3");
  });

  it("rejects a quantity whose sign contradicts the movement type", async () => {
    await expect(post(movement("OUTWARD", "5"))).rejects.toThrow(/Invalid quantity/);
    await expect(post(movement("INWARD", "-5"))).rejects.toThrow(/Invalid quantity/);
    await expect(post(movement("ADJUSTMENT", "0"))).rejects.toThrow(/Invalid quantity/);
  });

  it("blocks outward beyond available batch stock with INSUFFICIENT_STOCK details", async () => {
    await post(movement("INWARD", "100"));
    const error = await expectAppError(post(movement("OUTWARD", "-150")), "INSUFFICIENT_STOCK");

    expect(error).toBeInstanceOf(InsufficientStockError);
    expect(error.details).toEqual({
      sku: sku.code,
      godown: godown.code,
      batch: batch.batchNumber,
      available: "100",
      requested: "150",
    });
    expect(await balance()).toBe("100");
    expect(await prisma.inventoryLedger.count()).toBe(1);
  });

  it("blocks outward from a batch that never had stock", async () => {
    await expectAppError(post(movement("OUTWARD", "-1")), "INSUFFICIENT_STOCK");
  });
});

describe("reversals", () => {
  it("posts an exact counter-entry and keeps the original visible", async () => {
    await post(movement("OPENING", "575"));
    const mistake = await post(movement("INWARD", "1000"));
    expect(await balance()).toBe("1575");

    const { original, reversal } = await reverse(mistake.id);

    expect(original.id).toBe(mistake.id);
    expect(reversal.movementType).toBe("REVERSAL");
    expect(reversal.quantity.toString()).toBe("-1000");
    expect(reversal.reversesEntryId).toBe(mistake.id);
    expect(reversal.referenceId).toBe(mistake.referenceId);
    expect(reversal.balanceAfter.toString()).toBe("575");
    expect(await balance()).toBe("575");
    expect(await prisma.inventoryLedger.count()).toBe(3);
    expect(await findStockDrift()).toEqual([]);
  });

  it("reverses outward and adjustment entries in the right direction", async () => {
    await post(movement("INWARD", "100"));
    const outward = await post(movement("OUTWARD", "-40"));
    const writeOff = await post(movement("ADJUSTMENT", "-10"));

    await reverse(outward.id);
    await reverse(writeOff.id);
    expect(await balance()).toBe("100");
  });

  it("refuses to reverse twice or to reverse a reversal", async () => {
    const entry = await post(movement("INWARD", "10"));
    const { reversal } = await reverse(entry.id);

    await expectAppError(reverse(entry.id), "ALREADY_REVERSED");
    await expectAppError(reverse(reversal.id), "CANNOT_REVERSE");
  });

  it("refuses a reversal that would make stock negative", async () => {
    const inward = await post(movement("INWARD", "100"));
    await post(movement("OUTWARD", "-80"));

    await expectAppError(reverse(inward.id), "INSUFFICIENT_STOCK");
    expect(await balance()).toBe("20");
  });

  it("returns NOT_FOUND for an unknown entry", async () => {
    await expectAppError(reverse(randomUUID()), "NOT_FOUND");
  });
});

describe("database guards", () => {
  it("forbids UPDATE and DELETE on ledger entries", async () => {
    const entry = await post(movement("INWARD", "10"));

    await expect(
      prisma.$executeRaw`UPDATE "inventory_ledger" SET "quantity" = 99 WHERE "id" = ${entry.id}::uuid`,
    ).rejects.toThrow(/append-only/);
    await expect(
      prisma.$executeRaw`DELETE FROM "inventory_ledger" WHERE "id" = ${entry.id}::uuid`,
    ).rejects.toThrow(/append-only/);
  });

  it("rejects a ledger row whose sign contradicts its movement type", async () => {
    await expect(
      prisma.inventoryLedger.create({
        data: {
          skuId: sku.id,
          godownId: godown.id,
          batchId: batch.id,
          movementType: "OUTWARD",
          quantity: 5,
          balanceAfter: 5,
          referenceType: "DISPATCH",
          referenceId: randomUUID(),
          referenceNo: "X",
          createdById: actor.userId,
        },
      }),
    ).rejects.toThrow(/inventory_ledger_sign_chk/);
  });

  it("rejects a reversal that does not mirror its original", async () => {
    const entry = await post(movement("INWARD", "10"));

    await expect(
      prisma.inventoryLedger.create({
        data: {
          skuId: sku.id,
          godownId: godown.id,
          batchId: batch.id,
          movementType: "REVERSAL",
          quantity: -3,
          balanceAfter: 7,
          referenceType: entry.referenceType,
          referenceId: entry.referenceId,
          referenceNo: entry.referenceNo,
          reversesEntryId: entry.id,
          createdById: actor.userId,
        },
      }),
    ).rejects.toThrow(/must mirror/);
  });

  it("rejects a batch that belongs to a different SKU", async () => {
    const otherSku = await createSku();
    const otherBatch = await createBatch(otherSku.id);

    await expect(
      post({ ...movement("INWARD", "10"), key: { skuId: sku.id, godownId: godown.id, batchId: otherBatch.id } }),
    ).rejects.toThrow();
    expect(await prisma.inventoryLedger.count()).toBe(0);
    expect(await prisma.stockBalance.count()).toBe(0);
  });

  it("rejects a negative stock balance written directly", async () => {
    await expect(
      prisma.$executeRaw`
        INSERT INTO "stock_balance" ("sku_id", "godown_id", "batch_id", "quantity")
        VALUES (${sku.id}::uuid, ${godown.id}::uuid, ${batch.id}::uuid, -1)`,
    ).rejects.toThrow(/stock_balance_non_negative_chk/);
  });
});

describe("concurrency", () => {
  it("lets exactly one of two competing dispatches through", async () => {
    await post(movement("INWARD", "100"));

    const results = await Promise.allSettled([post(movement("OUTWARD", "-60")), post(movement("OUTWARD", "-60"))]);

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect((rejected.reason as AppError).code).toBe("INSUFFICIENT_STOCK");
    expect(await balance()).toBe("40");
    expect(await findStockDrift()).toEqual([]);
  });

  it("never oversells under many parallel dispatches", async () => {
    await post(movement("INWARD", "95"));

    const results = await Promise.allSettled(Array.from({ length: 10 }, () => post(movement("OUTWARD", "-10"))));

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(9);
    expect(await balance()).toBe("5");
    expect(await findStockDrift()).toEqual([]);
  });

  it("reverses an entry at most once under parallel requests", async () => {
    const entry = await post(movement("INWARD", "50"));

    const results = await Promise.allSettled(Array.from({ length: 5 }, () => reverse(entry.id)));

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    for (const r of results) {
      if (r.status === "rejected") expect((r.reason as AppError).code).toBe("ALREADY_REVERSED");
    }
    expect(await balance()).toBe("0");
    expect(await prisma.inventoryLedger.count({ where: { movementType: "REVERSAL" } })).toBe(1);
  });
});
