import { describe, expect, it } from "vitest";
import { prisma } from "@/server/db/client";
import { approveAdjustment, createAdjustment } from "@/server/modules/adjustments/adjustments.service";
import { postDispatch } from "@/server/modules/dispatch/dispatch.service";
import { postOpeningBalance } from "@/server/modules/opening/opening.service";
import { postGrn } from "@/server/modules/purchasing/grn.service";
import { createPurchaseOrder } from "@/server/modules/purchasing/purchase-order.service";
import { reverseEntry } from "@/server/modules/reversals/reversals.service";
import { findStockDrift } from "../../helpers/database";
import { actorFor, createGodown, createSku, createSupplier, createUser } from "../../helpers/factories";

/**
 * Spec §14 worked scenario — SKU RM-001, Main Warehouse, Batch B-100 —
 * executed through the real services with separate roles.
 */
describe("spec §14 worked scenario", () => {
  it("ends at 575 with a complete, consistent audit trail", async () => {
    const admin = actorFor(await createUser("ADMIN"));
    const manager = actorFor(await createUser("STORE_MANAGER"));
    const operator = actorFor(await createUser("WAREHOUSE_OPERATOR"));
    const sku = await createSku({ code: "RM-001" });
    const godown = await createGodown({ code: "MAIN", name: "Main Warehouse" });
    const supplier = await createSupplier();

    const stock = async () =>
      (
        await prisma.stockBalance.findFirst({ where: { skuId: sku.id, godownId: godown.id } })
      )?.quantity.toString();

    // 1. Opening +500
    await postOpeningBalance(admin, {
      godownId: godown.id,
      asOf: "2026-04-01",
      items: [{ skuId: sku.id, batchNumber: "B-100", quantity: "500" }],
    });
    expect(await stock()).toBe("500");

    // 2. GRN +300 against a purchase order
    const po = await createPurchaseOrder(manager, {
      supplierId: supplier.id,
      orderDate: "2026-09-01",
      submit: true,
      items: [{ skuId: sku.id, orderedQty: "1300" }],
    });
    const poItem = await prisma.purchaseOrderItem.findFirstOrThrow({ where: { purchaseOrderId: po.id } });
    await postGrn(operator, po.id, {
      godownId: godown.id,
      items: [{ purchaseOrderItemId: poItem.id, batchNumber: "B-100", receivedQty: "300", acceptedQty: "300" }],
    });
    expect(await stock()).toBe("800");

    // 3. Dispatch −200
    const batch = await prisma.batch.findFirstOrThrow({ where: { skuId: sku.id, batchNumber: "B-100" } });
    await postDispatch(operator, {
      godownId: godown.id,
      items: [{ skuId: sku.id, batchId: batch.id, quantity: "200" }],
    });
    expect(await stock()).toBe("600");

    // 4. Damage adjustment −25 (operator requests, manager approves)
    const adjustment = await createAdjustment(operator, {
      godownId: godown.id,
      reasonCode: "DAMAGE",
      items: [{ skuId: sku.id, batchId: batch.id, quantity: "-25" }],
    });
    expect(await stock()).toBe("600");
    await approveAdjustment(manager, adjustment.id);
    expect(await stock()).toBe("575");

    // 5. Mistaken posting +1000
    const mistakenGrn = await postGrn(operator, po.id, {
      godownId: godown.id,
      items: [{ purchaseOrderItemId: poItem.id, batchNumber: "B-100", receivedQty: "1000", acceptedQty: "1000" }],
    });
    expect(await stock()).toBe("1575");
    expect((await prisma.purchaseOrder.findUniqueOrThrow({ where: { id: po.id } })).status).toBe("FULLY_RECEIVED");

    // 6. Reversal −1000
    const mistakenEntry = await prisma.inventoryLedger.findFirstOrThrow({
      where: { referenceId: mistakenGrn.id, movementType: "INWARD" },
    });
    const reversal = await reverseEntry(manager, mistakenEntry.id, "Keyed 1000 instead of 100");
    expect(await stock()).toBe("575");

    // The trail: six entries, the mistake still visible and linked to its reversal.
    const ledger = await prisma.inventoryLedger.findMany({ orderBy: { entryNo: "asc" } });
    expect(ledger.map((e) => [e.movementType, e.quantity.toString(), e.balanceAfter.toString()])).toEqual([
      ["OPENING", "500", "500"],
      ["INWARD", "300", "800"],
      ["OUTWARD", "-200", "600"],
      ["ADJUSTMENT", "-25", "575"],
      ["INWARD", "1000", "1575"],
      ["REVERSAL", "-1000", "575"],
    ]);
    expect(reversal.reversesEntryId).toBe(mistakenEntry.id);
    expect(reversal.createdById).toBe(manager.userId);

    // Document consistency after the reversal.
    const poAfter = await prisma.purchaseOrder.findUniqueOrThrow({ where: { id: po.id }, include: { items: true } });
    expect(poAfter.status).toBe("PARTIALLY_RECEIVED");
    expect(poAfter.items[0].receivedQty.toString()).toBe("300");
    expect((await prisma.grn.findUniqueOrThrow({ where: { id: mistakenGrn.id } })).status).toBe("REVERSED");

    // Every stock document (and the reversal) is queued for Tally and audited.
    expect(await prisma.tallySyncJob.count()).toBe(6);
    expect(
      await prisma.auditLog.count({
        where: {
          action: {
            in: ["OPENING_BALANCE_POSTED", "GRN_POSTED", "DISPATCH_POSTED", "ADJUSTMENT_APPROVED", "LEDGER_ENTRY_REVERSED"],
          },
        },
      }),
    ).toBe(6);
    expect(await findStockDrift()).toEqual([]);
  });
});
