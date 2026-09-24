import type { Batch, Sku } from "@prisma/client";
import { beforeEach, describe, expect, it } from "vitest";
import type { Actor } from "@/server/actor";
import { prisma } from "@/server/db/client";
import type { AppError } from "@/server/errors";
import {
  approveAdjustment,
  createAdjustment,
  rejectAdjustment,
} from "@/server/modules/adjustments/adjustments.service";
import { postDispatch } from "@/server/modules/dispatch/dispatch.service";
import { postOpeningBalance } from "@/server/modules/opening/opening.service";
import { reverseEntry } from "@/server/modules/reversals/reversals.service";
import { findStockDrift } from "../../helpers/database";
import { actorFor, createGodown, createSku, createUser } from "../../helpers/factories";

let admin: Actor;
let manager: Actor;
let operator: Actor;
let sku: Sku;
let godownId: string;
let batch: Batch;

beforeEach(async () => {
  admin = actorFor(await createUser("ADMIN"));
  manager = actorFor(await createUser("STORE_MANAGER"));
  operator = actorFor(await createUser("WAREHOUSE_OPERATOR"));
  sku = await createSku();
  godownId = (await createGodown()).id;
  await postOpeningBalance(admin, {
    godownId,
    asOf: "2026-04-01",
    items: [{ skuId: sku.id, batchNumber: "B-1", quantity: "100" }],
  });
  batch = await prisma.batch.findFirstOrThrow({ where: { skuId: sku.id } });
});

const stock = async () =>
  (await prisma.stockBalance.findFirstOrThrow({ where: { skuId: sku.id, batchId: batch.id } })).quantity.toString();

const errorCode = (p: Promise<unknown>) => p.then(() => "OK", (e: AppError) => e.code);

function request(quantity: string, actor = operator) {
  return createAdjustment(actor, {
    godownId,
    reasonCode: "DAMAGE",
    items: [{ skuId: sku.id, batchId: batch.id, quantity }],
  });
}

describe("adjustment workflow", () => {
  it("does not touch stock until approved, then posts the signed quantity", async () => {
    const adj = await request("-25");
    expect(adj.status).toBe("SUBMITTED");
    expect(adj.submittedById).toBe(operator.userId);
    expect(await stock()).toBe("100");

    const approved = await approveAdjustment(manager, adj.id, "Verified on floor");
    expect(approved.status).toBe("APPROVED");
    expect(approved.reviewedById).toBe(manager.userId);
    expect(approved.reviewedAt).not.toBeNull();
    expect(await stock()).toBe("75");

    const entry = await prisma.inventoryLedger.findFirstOrThrow({ where: { movementType: "ADJUSTMENT" } });
    expect(entry.quantity.toString()).toBe("-25");
    expect(entry.reasonCode).toBe("DAMAGE");
    expect(await prisma.adjustmentItem.count({ where: { ledgerEntryId: entry.id } })).toBe(1);
  });

  it("supports increases into a new batch", async () => {
    const adj = await createAdjustment(operator, {
      godownId,
      reasonCode: "COUNTING_ERROR",
      items: [{ skuId: sku.id, batchNumber: "B-FOUND", quantity: "7" }],
    });
    await approveAdjustment(manager, adj.id);
    const found = await prisma.batch.findFirstOrThrow({ where: { batchNumber: "B-FOUND" } });
    const balance = await prisma.stockBalance.findFirstOrThrow({ where: { batchId: found.id } });
    expect(balance.quantity.toString()).toBe("7");
  });

  it("enforces maker/checker separation, including for administrators", async () => {
    const own = await request("-5", manager);
    expect(await errorCode(approveAdjustment(manager, own.id))).toBe("MAKER_CHECKER_VIOLATION");
    expect(await errorCode(rejectAdjustment(manager, own.id, "no"))).toBe("MAKER_CHECKER_VIOLATION");
    expect(await errorCode(approveAdjustment(admin, own.id))).toBe("OK");
  });

  it("can only be reviewed once", async () => {
    const adj = await request("-5");
    await rejectAdjustment(manager, adj.id, "Stock found in bay 4");
    const rejected = await prisma.adjustment.findUniqueOrThrow({ where: { id: adj.id } });
    expect(rejected.status).toBe("REJECTED");
    expect(rejected.reviewNote).toBe("Stock found in bay 4");

    expect(await errorCode(approveAdjustment(admin, adj.id))).toBe("INVALID_STATE");
    expect(await prisma.inventoryLedger.count({ where: { movementType: "ADJUSTMENT" } })).toBe(0);
  });

  it("rejects a write-off larger than stock at submission", async () => {
    expect(await errorCode(request("-101"))).toBe("INSUFFICIENT_STOCK");
    expect(await prisma.adjustment.count()).toBe(0);
  });

  it("re-checks stock on approval and leaves the request pending if it no longer fits", async () => {
    const adj = await request("-80");
    await postDispatch(operator, { godownId, items: [{ skuId: sku.id, batchId: batch.id, quantity: "50" }] });

    expect(await errorCode(approveAdjustment(manager, adj.id))).toBe("INSUFFICIENT_STOCK");
    expect((await prisma.adjustment.findUniqueOrThrow({ where: { id: adj.id } })).status).toBe("SUBMITTED");
    expect(await stock()).toBe("50");
  });

  it("posts exactly one set of entries under concurrent approvals", async () => {
    const adj = await request("-10");
    const results = await Promise.allSettled([
      approveAdjustment(manager, adj.id),
      approveAdjustment(admin, adj.id),
      approveAdjustment(manager, adj.id),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await prisma.inventoryLedger.count({ where: { movementType: "ADJUSTMENT" } })).toBe(1);
    expect(await stock()).toBe("90");
  });

  it("is marked REVERSED when its entry is reversed", async () => {
    const adj = await request("-10");
    await approveAdjustment(manager, adj.id);
    const entry = await prisma.inventoryLedger.findFirstOrThrow({ where: { movementType: "ADJUSTMENT" } });

    await reverseEntry(manager, entry.id, "Approved by mistake");

    expect((await prisma.adjustment.findUniqueOrThrow({ where: { id: adj.id } })).status).toBe("REVERSED");
    expect(await stock()).toBe("100");
    expect(await findStockDrift()).toEqual([]);
  });
});
