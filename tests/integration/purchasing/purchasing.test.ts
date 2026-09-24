import { randomUUID } from "node:crypto";
import type { PurchaseOrder, Sku } from "@prisma/client";
import { beforeEach, describe, expect, it } from "vitest";
import type { Actor } from "@/server/actor";
import { prisma } from "@/server/db/client";
import type { AppError } from "@/server/errors";
import { postGrn } from "@/server/modules/purchasing/grn.service";
import {
  cancelPurchaseOrder,
  createPurchaseOrder,
  submitPurchaseOrder,
  updateDraftPurchaseOrder,
} from "@/server/modules/purchasing/purchase-order.service";
import { findStockDrift } from "../../helpers/database";
import { actorFor, createGodown, createSku, createSupplier, createUser } from "../../helpers/factories";

let manager: Actor;
let operator: Actor;
let sku: Sku;
let godownId: string;
let supplierId: string;

beforeEach(async () => {
  manager = actorFor(await createUser("STORE_MANAGER"));
  operator = actorFor(await createUser("WAREHOUSE_OPERATOR"));
  sku = await createSku();
  godownId = (await createGodown()).id;
  supplierId = (await createSupplier()).id;
});

async function openPo(orderedQty = "1000", extraSkus: Sku[] = []): Promise<PurchaseOrder> {
  return createPurchaseOrder(manager, {
    supplierId,
    orderDate: "2026-09-01",
    submit: true,
    items: [sku, ...extraSkus].map((s) => ({ skuId: s.id, orderedQty })),
  });
}

async function poItemId(poId: string, skuId = sku.id) {
  return (await prisma.purchaseOrderItem.findFirstOrThrow({ where: { purchaseOrderId: poId, skuId } })).id;
}

function receive(poId: string, itemId: string, receivedQty: string, acceptedQty = receivedQty, extra = {}) {
  return postGrn(operator, poId, {
    godownId,
    items: [
      {
        purchaseOrderItemId: itemId,
        batchNumber: "B-1",
        receivedQty,
        acceptedQty,
        rejectionReason: acceptedQty === receivedQty ? undefined : "Damaged in transit",
      },
    ],
    ...extra,
  });
}

const errorCode = (p: Promise<unknown>) => p.then(() => "OK", (e: AppError) => e.code);

describe("purchase order lifecycle", () => {
  it("creates drafts, edits them, then opens them", async () => {
    const po = await createPurchaseOrder(manager, {
      supplierId,
      orderDate: "2026-09-01",
      submit: false,
      items: [{ skuId: sku.id, orderedQty: "10" }],
    });
    expect(po.status).toBe("DRAFT");
    expect(po.poNumber).toMatch(/^PO-\d{4}-00001$/);

    await updateDraftPurchaseOrder(manager, po.id, {
      supplierId,
      orderDate: "2026-09-02",
      items: [{ skuId: sku.id, orderedQty: "25", rate: "99.50" }],
    });
    const item = await prisma.purchaseOrderItem.findFirstOrThrow({ where: { purchaseOrderId: po.id } });
    expect(item.orderedQty.toString()).toBe("25");

    const opened = await submitPurchaseOrder(manager, po.id);
    expect(opened.status).toBe("OPEN");
    expect(await errorCode(submitPurchaseOrder(manager, po.id))).toBe("INVALID_STATE");
    expect(
      await errorCode(
        updateDraftPurchaseOrder(manager, po.id, { supplierId, orderDate: "2026-09-02", items: [{ skuId: sku.id, orderedQty: "1" }] }),
      ),
    ).toBe("INVALID_STATE");
  });

  it("cancels an open order but never one with receipts", async () => {
    const po = await openPo();
    const other = await openPo();
    await receive(other.id, await poItemId(other.id), "10");

    expect((await cancelPurchaseOrder(manager, po.id, "Supplier withdrew")).status).toBe("CANCELLED");
    expect(await errorCode(cancelPurchaseOrder(manager, other.id, "x"))).toBe("INVALID_STATE");
  });

  it("rejects quantities more precise than the unit allows", async () => {
    const pcs = await createSku({ uomCode: "PCS" });
    const result = createPurchaseOrder(manager, {
      supplierId,
      orderDate: "2026-09-01",
      submit: false,
      items: [{ skuId: pcs.id, orderedQty: "1.5" }],
    });
    expect(await errorCode(result)).toBe("VALIDATION_ERROR");
  });

  it("returns the same order for a repeated idempotency key", async () => {
    const idempotencyKey = randomUUID();
    const input = { supplierId, orderDate: "2026-09-01", submit: true, idempotencyKey, items: [{ skuId: sku.id, orderedQty: "5" }] };
    const [a, b] = await Promise.all([createPurchaseOrder(manager, input), createPurchaseOrder(manager, input)]);
    expect(a.id).toBe(b.id);
    expect(await prisma.purchaseOrder.count()).toBe(1);
  });
});

describe("goods receipt", () => {
  it("moves the order through partial to full receipt across several GRNs", async () => {
    const po = await openPo("1000");
    const itemId = await poItemId(po.id);

    await receive(po.id, itemId, "300");
    expect((await prisma.purchaseOrder.findUniqueOrThrow({ where: { id: po.id } })).status).toBe("PARTIALLY_RECEIVED");
    await receive(po.id, itemId, "400");
    await receive(po.id, itemId, "300");

    const after = await prisma.purchaseOrder.findUniqueOrThrow({ where: { id: po.id }, include: { items: true } });
    expect(after.status).toBe("FULLY_RECEIVED");
    expect(after.items[0].receivedQty.toString()).toBe("1000");
    expect(await errorCode(receive(po.id, itemId, "1"))).toBe("INVALID_STATE");
  });

  it("puts only the accepted quantity into stock (spec §6 example)", async () => {
    const po = await openPo("1000");
    const grn = await receive(po.id, await poItemId(po.id), "950", "940");

    const item = await prisma.grnItem.findFirstOrThrow({ where: { grnId: grn.id } });
    expect([item.receivedQty, item.acceptedQty, item.rejectedQty].map(String)).toEqual(["950", "940", "10"]);
    const balance = await prisma.stockBalance.findFirstOrThrow({ where: { skuId: sku.id } });
    expect(balance.quantity.toString()).toBe("940");
    const poItem = await prisma.purchaseOrderItem.findFirstOrThrow({ where: { purchaseOrderId: po.id } });
    expect(poItem.receivedQty.toString()).toBe("940");
  });

  it("records a fully rejected receipt without touching stock or Tally", async () => {
    const po = await openPo("100");
    const grn = await receive(po.id, await poItemId(po.id), "20", "0");

    expect(await prisma.grnItem.count({ where: { grnId: grn.id, ledgerEntryId: null } })).toBe(1);
    expect(await prisma.inventoryLedger.count()).toBe(0);
    expect(await prisma.tallySyncJob.count()).toBe(0);
    expect((await prisma.purchaseOrder.findUniqueOrThrow({ where: { id: po.id } })).status).toBe("OPEN");
  });

  it("blocks over-receipt with the pending quantity in the error", async () => {
    const po = await openPo("100");
    const itemId = await poItemId(po.id);
    await receive(po.id, itemId, "70");

    const error = (await receive(po.id, itemId, "40").catch((e: unknown) => e)) as AppError;
    expect(error.code).toBe("OVER_RECEIPT");
    expect(error.details).toMatchObject({ ordered: "100", alreadyReceived: "70", pending: "30", accepting: "40" });
    expect(await prisma.grn.count()).toBe(1);
  });

  it("refuses receipts against draft or cancelled orders and foreign lines", async () => {
    const draft = await createPurchaseOrder(manager, {
      supplierId,
      orderDate: "2026-09-01",
      submit: false,
      items: [{ skuId: sku.id, orderedQty: "10" }],
    });
    expect(await errorCode(receive(draft.id, await poItemId(draft.id), "1"))).toBe("INVALID_STATE");

    const open = await openPo();
    const other = await openPo();
    expect(await errorCode(receive(open.id, await poItemId(other.id), "1"))).toBe("VALIDATION_ERROR");
  });

  it("never exceeds the ordered quantity under concurrent receipts", async () => {
    const po = await openPo("100");
    const itemId = await poItemId(po.id);

    const results = await Promise.allSettled(Array.from({ length: 5 }, () => receive(po.id, itemId, "30")));

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(3);
    const poItem = await prisma.purchaseOrderItem.findUniqueOrThrow({ where: { id: itemId } });
    expect(poItem.receivedQty.toString()).toBe("90");
    expect(await findStockDrift()).toEqual([]);
  });

  it("numbers GRNs sequentially and audits them", async () => {
    const po = await openPo();
    const first = await receive(po.id, await poItemId(po.id), "1");
    const second = await receive(po.id, await poItemId(po.id), "1");

    expect(first.grnNumber).toMatch(/-00001$/);
    expect(second.grnNumber).toMatch(/-00002$/);
    expect(await prisma.auditLog.count({ where: { action: "GRN_POSTED" } })).toBe(2);
  });
});
