import { beforeEach, describe, expect, it } from "vitest";
import type { Actor } from "@/server/actor";
import { prisma } from "@/server/db/client";
import { createInvoice } from "@/server/modules/invoices/invoice.service";
import { removeSkuUnit, setSkuUnit } from "@/server/modules/masters/masters.service";
import { postGrn } from "@/server/modules/purchasing/grn.service";
import { createPurchaseOrder, updateDraftPurchaseOrder } from "@/server/modules/purchasing/purchase-order.service";
import { findStockDrift } from "../../helpers/database";
import { actorFor, createCustomer, createGodown, createSku, createSupplier, createUom, createUser } from "../../helpers/factories";
import { errorCode } from "../../helpers/scenario";

let admin: Actor;
let skuId: string;
let boxId: string;
let supplierId: string;

beforeEach(async () => {
  admin = actorFor(await createUser("ADMIN"));
  const sku = await createSku({ code: "FG-001", uomCode: "PCS" });
  skuId = sku.id;
  boxId = (await createUom("BOX", 0)).id;
  supplierId = (await createSupplier()).id;
  await setSkuUnit(admin, skuId, { uomId: boxId, factor: "24" });
});

const orderInBoxes = (orderedQty: string, extra: { rate?: string } = {}) =>
  createPurchaseOrder(admin, {
    supplierId,
    orderDate: "2026-09-24",
    submit: true,
    items: [{ skuId, orderedQty, uomId: boxId, ...extra }],
  });

describe("SKU alternate units", () => {
  it("rejects the base unit and unknown units, and updates the factor on re-save", async () => {
    const sku = await prisma.sku.findUniqueOrThrow({ where: { id: skuId } });
    expect(await errorCode(setSkuUnit(admin, skuId, { uomId: sku.baseUomId, factor: "1" }))).toBe("VALIDATION_ERROR");
    expect(await errorCode(setSkuUnit(admin, skuId, { uomId: crypto.randomUUID(), factor: "2" }))).toBe("NOT_FOUND");

    await setSkuUnit(admin, skuId, { uomId: boxId, factor: "12" });
    const units = await prisma.skuUnit.findMany({ where: { skuId } });
    expect(units.map((u) => u.factor.toString())).toEqual(["12"]);
    expect(await prisma.auditLog.count({ where: { action: "MASTER_UPDATED", entityId: skuId } })).toBe(2);
  });

  it("stores PO lines in base units with the as-entered snapshot, and receives in base units", async () => {
    const po = await orderInBoxes("5", { rate: "480" });
    const [item] = await prisma.purchaseOrderItem.findMany({ where: { purchaseOrderId: po.id } });
    expect(item.orderedQty.toString()).toBe("120");
    expect(item.entryUomId).toBe(boxId);
    expect(item.entryQuantity?.toString()).toBe("5");
    expect(item.entryFactor?.toString()).toBe("24");
    expect(item.rate?.toString()).toBe("480");

    const godown = await createGodown();
    await postGrn(actorFor(await createUser("WAREHOUSE_OPERATOR")), po.id, {
      godownId: godown.id,
      items: [{ purchaseOrderItemId: item.id, batchNumber: "B-1", receivedQty: "120", acceptedQty: "120" }],
    });
    const ledger = await prisma.inventoryLedger.findFirstOrThrow({ where: { skuId } });
    expect(ledger.quantity.toString()).toBe("120");
    expect(await findStockDrift()).toEqual([]);
  });

  it("keeps the snapshot when the factor changes later", async () => {
    const po = await orderInBoxes("2");
    await setSkuUnit(admin, skuId, { uomId: boxId, factor: "12" });
    const [item] = await prisma.purchaseOrderItem.findMany({ where: { purchaseOrderId: po.id } });
    expect([item.orderedQty.toString(), item.entryFactor?.toString()]).toEqual(["48", "24"]);
  });

  it("refuses quantities that are not whole in the base unit, and units not set up", async () => {
    expect(await errorCode(orderInBoxes("0.1"))).toBe("VALIDATION_ERROR");
    await removeSkuUnit(admin, skuId, boxId);
    expect(await errorCode(orderInBoxes("1"))).toBe("VALIDATION_ERROR");
    expect(await prisma.purchaseOrder.count()).toBe(0);
  });

  it("converts again when a draft is edited, and base-unit lines carry no snapshot", async () => {
    const po = await createPurchaseOrder(admin, {
      supplierId,
      orderDate: "2026-09-24",
      submit: false,
      items: [{ skuId, orderedQty: "10" }],
    });
    let [item] = await prisma.purchaseOrderItem.findMany({ where: { purchaseOrderId: po.id } });
    expect([item.orderedQty.toString(), item.entryUomId]).toEqual(["10", null]);

    await updateDraftPurchaseOrder(admin, po.id, {
      supplierId,
      orderDate: "2026-09-24",
      items: [{ skuId, orderedQty: "3", uomId: boxId }],
    });
    [item] = await prisma.purchaseOrderItem.findMany({ where: { purchaseOrderId: po.id } });
    expect([item.orderedQty.toString(), item.entryQuantity?.toString()]).toEqual(["72", "3"]);
  });

  it("converts invoice lines to base units", async () => {
    const invoice = await createInvoice(admin, {
      customerId: (await createCustomer()).id,
      invoiceDate: "2026-09-24",
      items: [{ skuId, quantity: "1.5", uomId: boxId }],
    });
    const [item] = await prisma.invoiceItem.findMany({ where: { invoiceId: invoice.id } });
    expect([item.quantity.toString(), item.entryQuantity?.toString(), item.entryFactor?.toString()]).toEqual([
      "36",
      "1.5",
      "24",
    ]);
  });

  it("guards the stored snapshot with a database check", async () => {
    const po = await orderInBoxes("1");
    const [item] = await prisma.purchaseOrderItem.findMany({ where: { purchaseOrderId: po.id } });
    await expect(
      prisma.purchaseOrderItem.update({ where: { id: item.id }, data: { entryQuantity: "2" } }),
    ).rejects.toThrow(/purchase_order_item_entry_chk/);
  });
});
