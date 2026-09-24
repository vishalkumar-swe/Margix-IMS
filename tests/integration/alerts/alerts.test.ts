import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db/client";
import { saveReorderRule } from "@/server/modules/alerts/alerts.service";
import { postDispatch } from "@/server/modules/dispatch/dispatch.service";
import { postOpeningBalance } from "@/server/modules/opening/opening.service";
import { reverseEntry } from "@/server/modules/reversals/reversals.service";
import { stockedScenario, type StockedScenario } from "../../helpers/scenario";

let s: StockedScenario;

beforeEach(async () => {
  s = await stockedScenario("100");
});

const dispatch = (quantity: string) =>
  postDispatch(s.operator, { godownId: s.godown.id, items: [{ skuId: s.sku.id, batchId: s.batch.id, quantity }] });

const alerts = () => prisma.stockAlert.findMany({ orderBy: { createdAt: "asc" } });

describe("low-stock alerts (spec §6.5)", () => {
  it("raises one alert when stock drops below the reorder level and never duplicates it", async () => {
    await saveReorderRule(s.manager, { skuId: s.sku.id, godownId: s.godown.id, reorderLevel: "50", isActive: true });
    expect(await alerts()).toHaveLength(0);

    await dispatch("60");
    await dispatch("10");
    await dispatch("5");

    const [alert, ...rest] = await alerts();
    expect(rest).toHaveLength(0);
    expect(alert).toMatchObject({ status: "ACTIVE", alertType: "LOW_STOCK" });
    expect(alert.currentQty.toString()).toBe("25");
    expect(alert.thresholdQty.toString()).toBe("50");
  });

  it("resolves the alert when stock recovers and raises a new one on the next drop", async () => {
    await saveReorderRule(s.manager, { skuId: s.sku.id, godownId: s.godown.id, reorderLevel: "50", isActive: true });
    await dispatch("60");
    await postOpeningBalance(s.admin, {
      godownId: s.godown.id,
      asOf: "2026-04-01",
      items: [{ skuId: s.sku.id, batchNumber: "B-2", quantity: "30" }],
    });
    const [resolved] = await alerts();
    expect(resolved.status).toBe("RESOLVED");
    expect(resolved.currentQty.toString()).toBe("70");

    await dispatch("30");
    expect((await alerts()).map((a) => a.status)).toEqual(["RESOLVED", "ACTIVE"]);
  });

  it("evaluates the level over all batches in the godown and on reversals", async () => {
    await saveReorderRule(s.manager, { skuId: s.sku.id, godownId: s.godown.id, reorderLevel: "50", isActive: true });
    const outward = await dispatch("60");
    const item = await prisma.outwardItem.findFirstOrThrow({ where: { outwardId: outward.id } });

    await reverseEntry(s.manager, item.ledgerEntryId, "Dispatch cancelled");

    expect((await alerts()).map((a) => a.status)).toEqual(["RESOLVED"]);
  });

  it("raises immediately when a rule is saved above current stock and resolves when disabled", async () => {
    const rule = { skuId: s.sku.id, godownId: s.godown.id, reorderLevel: "150" };
    await saveReorderRule(s.manager, { ...rule, isActive: true });
    expect((await alerts()).map((a) => a.status)).toEqual(["ACTIVE"]);

    await saveReorderRule(s.manager, { ...rule, isActive: false });
    expect((await alerts()).map((a) => a.status)).toEqual(["RESOLVED"]);
  });

  it("is enforced by the database: one active alert per SKU and godown", async () => {
    await saveReorderRule(s.manager, { skuId: s.sku.id, godownId: s.godown.id, reorderLevel: "150", isActive: true });
    await expect(
      prisma.stockAlert.create({
        data: { skuId: s.sku.id, godownId: s.godown.id, currentQty: 1, thresholdQty: 150 },
      }),
    ).rejects.toThrow();
  });
});
