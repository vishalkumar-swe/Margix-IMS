import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db/client";
import { postDispatch } from "@/server/modules/dispatch/dispatch.service";
import { correctOpeningLine, voidOpeningLine } from "@/server/modules/opening/opening-corrections.service";
import { listOpeningLines } from "@/server/modules/opening/opening.queries";
import { findStockDrift } from "../../helpers/database";
import { errorCode, stockedScenario, stockOf, type StockedScenario } from "../../helpers/scenario";

let s: StockedScenario;
let itemId: string;
beforeEach(async () => {
  s = await stockedScenario("100");
  itemId = (await prisma.openingBalanceItem.findFirstOrThrow()).id;
});

const query = { page: 1, pageSize: 50 } as const;

describe("opening stock corrections", () => {
  it("edit posts the corrected line, reverses the old one and links them", async () => {
    const corrected = await correctOpeningLine(s.admin, itemId, { quantity: "80", batchNumber: "B-1", reason: "Recount" });
    expect(await stockOf(s.sku.id, s.godown.id, s.batch.id)).toBe("80");

    const { items } = await listOpeningLines(query);
    const [newLine, oldLine] = items;
    expect(newLine.openingBalance.openingNumber).toBe(corrected.openingNumber);
    expect(newLine.replaces?.openingBalance.openingNumber).toBe(oldLine.openingBalance.openingNumber);
    expect(oldLine.ledgerEntry.reversedBy?.remarks).toContain("Recount");
    expect((await listOpeningLines({ ...query, state: "active" })).items.map((l) => l.id)).toEqual([newLine.id]);
    expect(await findStockDrift()).toEqual([]);
  });

  it("edit can move the quantity to another batch", async () => {
    await correctOpeningLine(s.admin, itemId, { quantity: "100", batchNumber: "B-2", reason: "Wrong batch" });
    const b2 = await prisma.batch.findFirstOrThrow({ where: { batchNumber: "B-2" } });
    expect([await stockOf(s.sku.id, s.godown.id, s.batch.id), await stockOf(s.sku.id, s.godown.id, b2.id)]).toEqual(["0", "100"]);
  });

  it("delete reverses the line; a second edit or delete is refused", async () => {
    await voidOpeningLine(s.admin, itemId, "Posted twice");
    expect(await stockOf(s.sku.id, s.godown.id, s.batch.id)).toBe("0");
    expect(await errorCode(voidOpeningLine(s.admin, itemId, "again"))).toBe("ALREADY_REVERSED");
    expect(await errorCode(correctOpeningLine(s.admin, itemId, { quantity: "5", batchNumber: "B-1", reason: "x" }))).toBe(
      "ALREADY_REVERSED",
    );
  });

  it("refuses to remove stock that has already been dispatched, and changes nothing", async () => {
    await postDispatch(s.operator, { godownId: s.godown.id, items: [{ skuId: s.sku.id, batchId: s.batch.id, quantity: "60" }] });
    expect(await errorCode(voidOpeningLine(s.admin, itemId, "oops"))).toBe("INSUFFICIENT_STOCK");
    expect(await errorCode(correctOpeningLine(s.admin, itemId, { quantity: "100", batchNumber: "B-9", reason: "x" }))).toBe(
      "INSUFFICIENT_STOCK",
    );
    expect(await stockOf(s.sku.id, s.godown.id, s.batch.id)).toBe("40");
    expect(await prisma.openingBalance.count()).toBe(1);
  });
});
