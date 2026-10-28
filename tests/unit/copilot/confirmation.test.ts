import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { actorFor, createCustomer, createGodown, createSku, createSupplier, createUser } from "../../helpers/factories";
import { formatEntryNo } from "@/lib/format";
import { todayIst } from "@/lib/dates";
import { prisma } from "@/server/db/client";
import { postOpeningBalance } from "@/server/modules/opening/opening.service";
import { AutonomousAgentService } from "@/server/modules/copilot/agent.service";

const context = { role: "ADMIN" as const, route: "/invoices" };

async function createInvoiceFixture(options: { quantity?: string } = {}) {
  const admin = await createUser("ADMIN");
  const actor = actorFor(admin);
  const customer = await createCustomer();
  const sku = await createSku();
  const firstGodown = await createGodown({ code: `GA-${randomUUID().slice(0, 6)}`, name: "First Active Godown" });
  const dispatchGodown = await createGodown({ code: `GB-${randomUUID().slice(0, 6)}`, name: "Dispatch Godown" });

  const batches = await Promise.all([
    prisma.batch.create({
      data: { skuId: sku.id, batchNumber: "A-EARLY", expiryDate: new Date("2026-12-01") },
    }),
    prisma.batch.create({
      data: { skuId: sku.id, batchNumber: "B-FIRST", expiryDate: new Date("2027-01-01") },
    }),
    prisma.batch.create({
      data: { skuId: sku.id, batchNumber: "B-SECOND", expiryDate: new Date("2027-02-01") },
    }),
  ]);
  const [earlyBatch, firstBatch, secondBatch] = batches;

  await prisma.stockBalance.createMany({
    data: [
      // A godown that is returned first by an unordered "first active" lookup
      // but cannot cover the invoice on its own.
      { skuId: sku.id, godownId: firstGodown.id, batchId: earlyBatch.id, quantity: "5" },
      // The godown that covers the full invoice, split across two FEFO batches.
      { skuId: sku.id, godownId: dispatchGodown.id, batchId: firstBatch.id, quantity: "4" },
      { skuId: sku.id, godownId: dispatchGodown.id, batchId: secondBatch.id, quantity: "6" },
    ],
  });

  const invoice = await prisma.invoice.create({
    data: {
      invoiceNumber: `INV-TEST-${randomUUID().toUpperCase().slice(0, 8)}`,
      customerId: customer.id,
      invoiceDate: new Date("2026-10-01"),
      createdById: admin.id,
      taxType: "INTRA",
      placeOfSupply: "27",
      items: {
        create: [
          {
            lineNo: 1,
            skuId: sku.id,
            quantity: options.quantity ?? "10",
            rate: "100",
            gstRate: "5",
          },
        ],
      },
    },
  });

  return { admin, actor, customer, sku, firstGodown, dispatchGodown, invoice, batches };
}

describe("Copilot confirmation write path", () => {
  it("rejects a dispatch payload that bypasses the normal dispatch validation", async () => {
    const { actor, invoice, dispatchGodown, sku, batches } = await createInvoiceFixture();

    const result = await AutonomousAgentService.executeConfirmation(actor, {
      confirmationId: randomUUID(),
      actionType: "POST_DISPATCH",
      payload: {
        invoiceId: invoice.id,
        godownId: dispatchGodown.id,
        items: [{ skuId: sku.id, batchId: batches[1].id, quantity: "-5" }],
      },
      decision: "confirm",
    });

    expect(result.success).toBe(false);
    expect(result.data.status).toBe("failed");
    expect(result.data.message).toMatch(/positive number/i);
    expect(await prisma.outward.count()).toBe(0);
  });

  it("posts a confirmed dispatch exactly once when the confirmation is replayed", async () => {
    const { actor, invoice, dispatchGodown, sku, batches } = await createInvoiceFixture();

    const confirmationId = randomUUID();
    const payload = {
      invoiceId: invoice.id,
      godownId: dispatchGodown.id,
      items: [{ skuId: sku.id, batchId: batches[1].id, quantity: "4" }],
    };

    const first = await AutonomousAgentService.executeConfirmation(actor, {
      confirmationId,
      actionType: "POST_DISPATCH",
      payload,
      decision: "confirm",
    });
    const second = await AutonomousAgentService.executeConfirmation(actor, {
      confirmationId,
      actionType: "POST_DISPATCH",
      payload,
      decision: "confirm",
    });

    expect(first.success).toBe(true);
    expect(second.success).toBe(true);
    expect(first.data.message).toBe(second.data.message);

    const outwards = await prisma.outward.findMany({ where: { invoiceId: invoice.id } });
    expect(outwards).toHaveLength(1);

    const item = await prisma.invoiceItem.findFirstOrThrow({ where: { invoiceId: invoice.id } });
    expect(item.dispatchedQty.toString()).toBe("4");

    const batch = await prisma.stockBalance.findFirstOrThrow({
      where: { godownId: dispatchGodown.id, batchId: batches[1].id },
    });
    expect(batch.quantity.toString()).toBe("0");
  });

  it("allocates the full invoice from the readiness-recommended godown across FEFO batches", async () => {
    const { actor, invoice, dispatchGodown, firstGodown } = await createInvoiceFixture();

    const plan = await AutonomousAgentService.executePlan(
      `dispatch invoice ${invoice.invoiceNumber}`,
      context,
      actor,
    );

    expect(plan.confirmation?.actionType).toBe("POST_DISPATCH");
    expect(plan.confirmation?.payload.godownId).toBe(dispatchGodown.id);
    expect(plan.confirmation?.payload.idempotencyKey).toBe(plan.confirmation?.id);

    const lines = plan.confirmation?.payload.items as Array<{ batchId: string; quantity: string }>;
    expect(lines).toHaveLength(2);
    // Earliest-expiring batch first, then the remainder.
    expect(lines.map((line) => line.quantity)).toEqual(["4", "6"]);

    const execution = await AutonomousAgentService.executeConfirmation(actor, {
      confirmationId: plan.confirmation!.id,
      actionType: plan.confirmation!.actionType,
      payload: plan.confirmation!.payload,
      decision: "confirm",
    });

    expect(execution.success).toBe(true);
    expect(execution.data.status).toBe("executed");

    const dispatchBalances = await prisma.stockBalance.findMany({
      where: { godownId: dispatchGodown.id },
    });
    expect(dispatchBalances.every((balance) => balance.quantity.isZero())).toBe(true);

    // The decoy godown must not have been touched.
    const decoyBalance = await prisma.stockBalance.findFirstOrThrow({
      where: { godownId: firstGodown.id },
    });
    expect(decoyBalance.quantity.toString()).toBe("5");

    const item = await prisma.invoiceItem.findFirstOrThrow({ where: { invoiceId: invoice.id } });
    expect(item.dispatchedQty.toString()).toBe("10");
  });

  it("proposes and executes a short-close for a partially received purchase order", async () => {
    const admin = await createUser("ADMIN");
    const actor = actorFor(admin);
    const supplier = await createSupplier();
    const sku = await createSku();
    const po = await prisma.purchaseOrder.create({
      data: {
        poNumber: `PO-TEST-${randomUUID().toUpperCase().slice(0, 8)}`,
        supplierId: supplier.id,
        createdById: admin.id,
        orderDate: new Date("2026-10-01"),
        taxType: "INTRA",
        status: "PARTIALLY_RECEIVED",
        items: {
          create: [
            {
              lineNo: 1,
              skuId: sku.id,
              orderedQty: "5",
              receivedQty: "2",
              rate: "100",
              gstRate: "5",
              hsnCode: "100630",
            },
          ],
        },
      },
    });

    const plan = await AutonomousAgentService.executePlan(`short close ${po.poNumber}`, context, actor);

    expect(plan.confirmation?.actionType).toBe("SHORT_CLOSE_PO");
    expect(plan.confirmation?.payload.poId).toBe(po.id);

    const execution = await AutonomousAgentService.executeConfirmation(actor, {
      confirmationId: plan.confirmation!.id,
      actionType: plan.confirmation!.actionType,
      payload: plan.confirmation!.payload,
      decision: "confirm",
    });

    expect(execution.success).toBe(true);
    const closed = await prisma.purchaseOrder.findUniqueOrThrow({ where: { id: po.id } });
    expect(closed.status).toBe("SHORT_CLOSED");
  });

  it("proposes and executes a ledger reversal without editing the original entry", async () => {
    const admin = await createUser("ADMIN");
    const actor = actorFor(admin);
    const godown = await createGodown({ code: `GR-${randomUUID().slice(0, 6)}` });
    const sku = await createSku();

    await postOpeningBalance(actor, {
      godownId: godown.id,
      asOf: todayIst(),
      items: [{ skuId: sku.id, quantity: "10", batchNumber: "REV-1", expiryDate: "2027-12-31" }],
    });
    const original = await prisma.inventoryLedger.findFirstOrThrow({
      where: { referenceType: "OPENING_BALANCE", skuId: sku.id },
    });

    const plan = await AutonomousAgentService.executePlan(
      `reverse ledger entry ${formatEntryNo(original.entryNo)}`,
      context,
      actor,
    );

    expect(plan.confirmation?.actionType).toBe("REVERSE_LEDGER");
    expect(plan.confirmation?.payload.entryId).toBe(original.id);

    const execution = await AutonomousAgentService.executeConfirmation(actor, {
      confirmationId: plan.confirmation!.id,
      actionType: plan.confirmation!.actionType,
      payload: plan.confirmation!.payload,
      decision: "confirm",
    });

    expect(execution.success).toBe(true);

    const untouched = await prisma.inventoryLedger.findUniqueOrThrow({ where: { id: original.id } });
    expect(untouched.quantity.toString()).toBe(original.quantity.toString());

    const reversal = await prisma.inventoryLedger.findFirstOrThrow({
      where: { reversesEntryId: original.id },
    });
    expect(reversal.movementType).toBe("REVERSAL");

    const balance = await prisma.stockBalance.findFirstOrThrow({
      where: { godownId: godown.id, skuId: sku.id },
    });
    expect(balance.quantity.toString()).toBe("0");
  });

  it("refuses to seed sandbox data without settings.manage", async () => {
    const clerk = await createUser("WAREHOUSE_OPERATOR");

    const result = await AutonomousAgentService.executePlan("seed demo sandbox data", {
      role: clerk.role.code,
      route: "/dashboard",
    });

    expect(result.markdownAnswer).toContain("Permission Denied");
    expect(await prisma.sku.count({ where: { code: { startsWith: "DEMO-" } } })).toBe(0);
  });
});
