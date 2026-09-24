import type { Godown } from "@prisma/client";
import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db/client";
import { postDispatch } from "@/server/modules/dispatch/dispatch.service";
import { reverseEntry } from "@/server/modules/reversals/reversals.service";
import { postTransfer } from "@/server/modules/transfers/transfer.service";
import { findStockDrift } from "../../helpers/database";
import { createGodown } from "../../helpers/factories";
import { errorCode, stockedScenario, stockOf, type StockedScenario } from "../../helpers/scenario";

let s: StockedScenario;
let destination: Godown;

beforeEach(async () => {
  s = await stockedScenario("100");
  destination = await createGodown();
});

const transfer = (quantity: string) =>
  postTransfer(s.operator, {
    fromGodownId: s.godown.id,
    toGodownId: destination.id,
    items: [{ skuId: s.sku.id, batchId: s.batch.id, quantity }],
  });

describe("godown transfers", () => {
  it("moves a batch between godowns atomically, keeping total stock", async () => {
    const doc = await transfer("30");

    expect(doc.transferNumber).toMatch(/^TRF-/);
    expect(await stockOf(s.sku.id, s.godown.id, s.batch.id)).toBe("70");
    expect(await stockOf(s.sku.id, destination.id, s.batch.id)).toBe("30");
    const legs = await prisma.inventoryLedger.findMany({ where: { referenceId: doc.id }, orderBy: { entryNo: "asc" } });
    expect(legs.map((l) => [l.movementType, l.quantity.toString()]).sort()).toEqual([
      ["TRANSFER_IN", "30"],
      ["TRANSFER_OUT", "-30"],
    ]);
    expect(await prisma.tallySyncJob.count({ where: { entityType: "TRANSFER" } })).toBe(1);
  });

  it("refuses to move more than the source batch holds", async () => {
    expect(await errorCode(transfer("101"))).toBe("INSUFFICIENT_STOCK");
    expect(await stockOf(s.sku.id, destination.id, s.batch.id)).toBe("0");
  });

  it("is rejected by the database when both godowns are the same", async () => {
    await expect(
      prisma.transfer.create({
        data: {
          transferNumber: "X",
          fromGodownId: s.godown.id,
          toGodownId: s.godown.id,
          transferredAt: new Date(),
          createdById: s.operator.userId,
        },
      }),
    ).rejects.toThrow(/transfer_distinct_godowns_chk/);
  });

  it("reverses both legs together, whichever leg is chosen", async () => {
    const doc = await transfer("30");
    const inLeg = await prisma.inventoryLedger.findFirstOrThrow({ where: { referenceId: doc.id, movementType: "TRANSFER_IN" } });

    await reverseEntry(s.manager, inLeg.id, "Wrong destination");

    expect(await stockOf(s.sku.id, s.godown.id, s.batch.id)).toBe("100");
    expect(await stockOf(s.sku.id, destination.id, s.batch.id)).toBe("0");
    expect(await prisma.inventoryLedger.count({ where: { referenceId: doc.id, movementType: "REVERSAL" } })).toBe(2);
    expect((await prisma.transfer.findUniqueOrThrow({ where: { id: doc.id } })).status).toBe("REVERSED");
    expect(await findStockDrift()).toEqual([]);
  });

  it("cannot be reversed once the moved stock has been used at the destination", async () => {
    const doc = await transfer("30");
    await postDispatch(s.operator, {
      godownId: destination.id,
      items: [{ skuId: s.sku.id, batchId: s.batch.id, quantity: "20" }],
    });
    const outLeg = await prisma.inventoryLedger.findFirstOrThrow({ where: { referenceId: doc.id, movementType: "TRANSFER_OUT" } });

    expect(await errorCode(reverseEntry(s.manager, outLeg.id, "Undo"))).toBe("INSUFFICIENT_STOCK");
    expect(await stockOf(s.sku.id, s.godown.id, s.batch.id)).toBe("70");
  });
});
