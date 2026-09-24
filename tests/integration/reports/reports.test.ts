import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { addDays, todayIst } from "@/lib/dates";
import { prisma } from "@/server/db/client";
import { toDecimal } from "@/server/db/decimal";
import { postDispatch } from "@/server/modules/dispatch/dispatch.service";
import { getMovementReport, getStockAging, getStockSummary } from "@/server/modules/reports/reports.queries";
import { stockSummaryCsv } from "@/server/modules/reports/reports.export";
import { postTransfer } from "@/server/modules/transfers/transfer.service";
import { createGodown, createSku } from "../../helpers/factories";
import { stockedScenario, type StockedScenario } from "../../helpers/scenario";

let s: StockedScenario;

beforeEach(async () => {
  s = await stockedScenario("500");
});

const today = todayIst();
const asStrings = (row: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(row).map(([k, v]) => [k, v === null ? null : String(v)]));

describe("stock summary report", () => {
  it("satisfies Opening + Inward − Outward ± Adjustments = Closing", async () => {
    await postDispatch(s.operator, {
      godownId: s.godown.id,
      items: [{ skuId: s.sku.id, batchId: s.batch.id, quantity: "200" }],
    });

    const { rows } = await getStockSummary({ from: today, to: today, groupBy: "sku", format: "json" });
    expect(rows).toHaveLength(1);
    expect(asStrings(rows[0] as unknown as Record<string, unknown>)).toMatchObject({
      skuCode: s.sku.code,
      godownCode: s.godown.code,
      opening: "0",
      inward: "500",
      outward: "200",
      adjustments: "0",
      closing: "300",
    });

    // Tomorrow's report opens with today's closing and has no movements.
    const next = await getStockSummary({ from: addDays(today, 1), to: addDays(today, 1), groupBy: "sku", format: "json" });
    expect(asStrings(next.rows[0] as unknown as Record<string, unknown>)).toMatchObject({
      opening: "300",
      inward: "0",
      outward: "0",
      closing: "300",
    });
  });

  it("splits by batch and treats transfers as inward/outward per godown", async () => {
    const other = await createGodown();
    await postTransfer(s.operator, {
      fromGodownId: s.godown.id,
      toGodownId: other.id,
      items: [{ skuId: s.sku.id, batchId: s.batch.id, quantity: "120" }],
    });

    const { rows } = await getStockSummary({ from: today, to: today, groupBy: "batch", format: "json" });
    const byGodown = Object.fromEntries(rows.map((r) => [r.godownCode, asStrings(r as unknown as Record<string, unknown>)]));
    expect(byGodown[s.godown.code]).toMatchObject({ batchNumber: "B-1", inward: "500", outward: "120", closing: "380" });
    expect(byGodown[other.code]).toMatchObject({ batchNumber: "B-1", inward: "120", outward: "0", closing: "120" });

    const csv = stockSummaryCsv(rows, true);
    expect(csv.split("\r\n")[0]).toBe("SKU,Name,Godown,Batch,Unit,Opening,Inward,Outward,Adjustments,Closing");
  });

  it("leaves out SKUs with nothing to report", async () => {
    await createSku();
    const { rows } = await getStockSummary({ from: today, to: today, groupBy: "sku", format: "json" });
    expect(rows).toHaveLength(1);
  });
});

describe("movement report", () => {
  it("lists entries inside the period only", async () => {
    const { entries } = await getMovementReport({ from: today, to: today, format: "json" });
    expect(entries).toHaveLength(1);
    const { entries: none } = await getMovementReport({ from: addDays(today, 1), to: addDays(today, 2), format: "json" });
    expect(none).toHaveLength(0);
  });
});

describe("slow and dead stock", () => {
  it("lists stock whose last movement is older than the configured period", async () => {
    // Recent stock is neither slow nor dead.
    expect((await getStockAging({ kind: "slow", format: "json" })).rows).toHaveLength(0);

    // An item last moved 120 days ago (inserted directly with a historical timestamp).
    const oldSku = await createSku();
    const batch = await prisma.batch.create({ data: { skuId: oldSku.id, batchNumber: "OLD-1" } });
    const createdAt = new Date(Date.now() - 120 * 24 * 60 * 60 * 1000);
    await prisma.inventoryLedger.create({
      data: {
        skuId: oldSku.id,
        godownId: s.godown.id,
        batchId: batch.id,
        movementType: "OPENING",
        quantity: toDecimal("7"),
        balanceAfter: toDecimal("7"),
        referenceType: "OPENING_BALANCE",
        referenceId: randomUUID(),
        referenceNo: "LEGACY",
        createdById: s.admin.userId,
        createdAt,
      },
    });
    await prisma.stockBalance.create({
      data: { skuId: oldSku.id, godownId: s.godown.id, batchId: batch.id, quantity: toDecimal("7") },
    });

    const slow = await getStockAging({ kind: "slow", format: "json" });
    const dead = await getStockAging({ kind: "dead", format: "json" });
    expect(slow.minDays).toBe(30);
    expect(dead.minDays).toBe(90);
    for (const report of [slow, dead]) {
      expect(report.rows).toHaveLength(1);
      expect(report.rows[0]).toMatchObject({ skuCode: oldSku.code, daysIdle: 120 });
    }
  });
});
