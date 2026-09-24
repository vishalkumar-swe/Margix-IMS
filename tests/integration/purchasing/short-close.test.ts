import { describe, expect, it } from "vitest";
import { prisma } from "@/server/db/client";
import { postGrn } from "@/server/modules/purchasing/grn.service";
import { createPurchaseOrder, shortClosePurchaseOrder } from "@/server/modules/purchasing/purchase-order.service";
import { createSupplier } from "../../helpers/factories";
import { errorCode, stockedScenario } from "../../helpers/scenario";

describe("purchase order short-close", () => {
  it("closes a partially received order and blocks further receipts", async () => {
    const s = await stockedScenario();
    const po = await createPurchaseOrder(s.manager, {
      supplierId: (await createSupplier()).id,
      orderDate: "2026-09-01",
      submit: true,
      items: [{ skuId: s.sku.id, orderedQty: "100" }],
    });
    const poItem = await prisma.purchaseOrderItem.findFirstOrThrow({ where: { purchaseOrderId: po.id } });
    const receive = () =>
      postGrn(s.operator, po.id, {
        godownId: s.godown.id,
        items: [{ purchaseOrderItemId: poItem.id, batchNumber: "B-9", receivedQty: "40", acceptedQty: "40" }],
      });

    expect(await errorCode(shortClosePurchaseOrder(s.manager, po.id, "Supplier discontinued"))).toBe("INVALID_STATE");
    await receive();

    const closed = await shortClosePurchaseOrder(s.manager, po.id, "Supplier discontinued the item");
    expect(closed.status).toBe("SHORT_CLOSED");
    expect(closed.closedById).toBe(s.manager.userId);
    expect(await errorCode(receive())).toBe("INVALID_STATE");
    expect(await prisma.auditLog.count({ where: { action: "PO_SHORT_CLOSED" } })).toBe(1);
  });
});
