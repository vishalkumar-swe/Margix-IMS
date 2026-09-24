import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db/client";
import { postDispatch } from "@/server/modules/dispatch/dispatch.service";
import { postGrn } from "@/server/modules/purchasing/grn.service";
import { createPurchaseOrder } from "@/server/modules/purchasing/purchase-order.service";
import { reverseEntry } from "@/server/modules/reversals/reversals.service";
import { postPurchaseReturn } from "@/server/modules/returns/purchase-return.service";
import { postSalesReturn } from "@/server/modules/returns/sales-return.service";
import { findStockDrift } from "../../helpers/database";
import { createSupplier } from "../../helpers/factories";
import { errorCode, stockedScenario, stockOf, type StockedScenario } from "../../helpers/scenario";

let s: StockedScenario;

beforeEach(async () => {
  s = await stockedScenario("100");
});

const stock = () => stockOf(s.sku.id, s.godown.id, s.batch.id);

describe("customer returns", () => {
  async function dispatch(quantity: string) {
    const outward = await postDispatch(s.operator, {
      godownId: s.godown.id,
      items: [{ skuId: s.sku.id, batchId: s.batch.id, quantity }],
    });
    const item = await prisma.outwardItem.findFirstOrThrow({ where: { outwardId: outward.id } });
    return { outward, item };
  }
  const returnGoods = (outwardId: string, outwardItemId: string, quantity: string) =>
    postSalesReturn(s.operator, { outwardId, reason: "Damaged in transit", items: [{ outwardItemId, quantity }] });

  it("brings goods back into the dispatched batch, up to the dispatched quantity", async () => {
    const { outward, item } = await dispatch("40");
    const sr = await returnGoods(outward.id, item.id, "15");

    expect(sr.returnNumber).toMatch(/^SRN-/);
    expect(await stock()).toBe("75");
    expect((await prisma.outwardItem.findUniqueOrThrow({ where: { id: item.id } })).returnedQty.toString()).toBe("15");

    const error = await returnGoods(outward.id, item.id, "26").catch((e: { code: string; details: unknown }) => e);
    expect(error).toMatchObject({ code: "OVER_RETURN", details: { returnable: "25", returning: "26" } });
  });

  it("blocks reversing a dispatch line with returns, until the return is reversed", async () => {
    const { outward, item } = await dispatch("40");
    await returnGoods(outward.id, item.id, "10");

    expect(await errorCode(reverseEntry(s.manager, item.ledgerEntryId, "Undo dispatch"))).toBe("CANNOT_REVERSE");

    const returnEntry = await prisma.inventoryLedger.findFirstOrThrow({ where: { movementType: "RETURN_IN" } });
    await reverseEntry(s.manager, returnEntry.id, "Return keyed twice");
    expect((await prisma.outwardItem.findUniqueOrThrow({ where: { id: item.id } })).returnedQty.toString()).toBe("0");

    await reverseEntry(s.manager, item.ledgerEntryId, "Undo dispatch");
    expect(await stock()).toBe("100");
    expect(await findStockDrift()).toEqual([]);
  });

  it("cannot return goods from a reversed dispatch line", async () => {
    const { outward, item } = await dispatch("10");
    await reverseEntry(s.manager, item.ledgerEntryId, "Cancelled");
    expect(await errorCode(returnGoods(outward.id, item.id, "1"))).toBe("OVER_RETURN");
  });
});

describe("supplier returns", () => {
  async function receive(ordered: string, accepted: string) {
    const po = await createPurchaseOrder(s.manager, {
      supplierId: (await createSupplier()).id,
      orderDate: "2026-09-01",
      submit: true,
      items: [{ skuId: s.sku.id, orderedQty: ordered }],
    });
    const poItem = await prisma.purchaseOrderItem.findFirstOrThrow({ where: { purchaseOrderId: po.id } });
    const grn = await postGrn(s.operator, po.id, {
      godownId: s.godown.id,
      items: [{ purchaseOrderItemId: poItem.id, batchNumber: "B-1", receivedQty: accepted, acceptedQty: accepted }],
    });
    const grnItem = await prisma.grnItem.findFirstOrThrow({ where: { grnId: grn.id } });
    return { po, poItem, grn, grnItem };
  }
  const returnToSupplier = (grnId: string, grnItemId: string, quantity: string) =>
    postPurchaseReturn(s.operator, { grnId, reason: "Quality failure", items: [{ grnItemId, quantity }] });
  const poState = async (poId: string) => {
    const po = await prisma.purchaseOrder.findUniqueOrThrow({ where: { id: poId }, include: { items: true } });
    return { status: po.status, received: po.items[0].receivedQty.toString() };
  };

  it("takes stock out and re-opens the quantity on the purchase order", async () => {
    const { po, grn, grnItem } = await receive("50", "50");
    expect(await poState(po.id)).toEqual({ status: "FULLY_RECEIVED", received: "50" });

    const pr = await returnToSupplier(grn.id, grnItem.id, "20");

    expect(pr.returnNumber).toMatch(/^PRN-/);
    expect(await stock()).toBe("130");
    expect(await poState(po.id)).toEqual({ status: "PARTIALLY_RECEIVED", received: "30" });
    expect(await errorCode(returnToSupplier(grn.id, grnItem.id, "31"))).toBe("OVER_RETURN");
  });

  it("blocks reversing a GRN line with supplier returns", async () => {
    const { grn, grnItem } = await receive("50", "50");
    await returnToSupplier(grn.id, grnItem.id, "5");
    expect(await errorCode(reverseEntry(s.manager, grnItem.ledgerEntryId!, "Undo receipt"))).toBe("CANNOT_REVERSE");
  });

  it("refuses to reverse a return once a replacement completed the order", async () => {
    const { po, poItem, grn, grnItem } = await receive("50", "50");
    await returnToSupplier(grn.id, grnItem.id, "20");
    await postGrn(s.operator, po.id, {
      godownId: s.godown.id,
      items: [{ purchaseOrderItemId: poItem.id, batchNumber: "B-2", receivedQty: "20", acceptedQty: "20" }],
    });
    const returnEntry = await prisma.inventoryLedger.findFirstOrThrow({ where: { movementType: "RETURN_OUT" } });

    expect(await errorCode(reverseEntry(s.manager, returnEntry.id, "Return was a mistake"))).toBe("CANNOT_REVERSE");
    expect(await poState(po.id)).toEqual({ status: "FULLY_RECEIVED", received: "50" });
  });

  it("restores the PO when a return is reversed", async () => {
    const { po, grn, grnItem } = await receive("50", "50");
    await returnToSupplier(grn.id, grnItem.id, "20");
    const returnEntry = await prisma.inventoryLedger.findFirstOrThrow({ where: { movementType: "RETURN_OUT" } });

    await reverseEntry(s.manager, returnEntry.id, "Supplier refused the return");

    expect(await poState(po.id)).toEqual({ status: "FULLY_RECEIVED", received: "50" });
    expect(await stock()).toBe("150");
    expect(await findStockDrift()).toEqual([]);
  });
});
