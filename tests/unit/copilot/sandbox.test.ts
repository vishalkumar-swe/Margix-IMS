import { describe, expect, it } from "vitest";
import { actorFor, createSku, createSupplier, createUser } from "../../helpers/factories";
import { prisma } from "@/server/db/client";
import { postDispatch } from "@/server/modules/dispatch/dispatch.service";
import {
  getSandboxStatus,
  purgeSandboxData,
  seedSandboxData,
} from "@/server/modules/copilot/sandbox.service";

describe("Sandbox Service", () => {
  it("seeds, reports and purges demo data without deleting production documents", async () => {
    const admin = await createUser("ADMIN");
    const actor = actorFor(admin);

    const seeded = await seedSandboxData(actor);
    expect(seeded.success).toBe(true);

    const status = await getSandboxStatus();
    expect(status.hasDemoData).toBe(true);
    expect(status.demoSkuCount).toBe(1);
    expect(status.demoPoCount).toBe(1);
    expect(status.demoGrnCount).toBe(1);
    expect(status.demoInvoiceCount).toBe(1);
    expect(status.demoStockBags).toBe(100);

    // Exercise the same dispatch path the guided tour uses, so purge has to
    // unlink outward items and their immutable ledger rows in the right order.
    const demoInvoice = await prisma.invoice.findFirstOrThrow({
      where: { invoiceNumber: { startsWith: "DEMO-" } },
    });
    const demoBalance = await prisma.stockBalance.findFirstOrThrow({
      where: { sku: { code: "DEMO-BASMATI-01" }, quantity: { gt: 0 } },
    });
    await postDispatch(actor, {
      godownId: demoBalance.godownId,
      invoiceId: demoInvoice.id,
      items: [
        {
          skuId: demoBalance.skuId,
          batchId: demoBalance.batchId,
          quantity: "10",
        },
      ],
    });
    expect((await getSandboxStatus()).demoStockBags).toBe(90);

    // A real document that must survive the demo purge.
    const productionSku = await createSku();
    const supplier = await createSupplier();
    const productionPo = await prisma.purchaseOrder.create({
      data: {
        poNumber: "PROD-PO-001",
        supplierId: supplier.id,
        createdById: admin.id,
        orderDate: new Date("2026-01-01"),
        taxType: "INTRA",
        items: {
          create: [
            {
              lineNo: 1,
              skuId: productionSku.id,
              orderedQty: "5",
              rate: "100",
              gstRate: "18",
            },
          ],
        },
      },
    });

    await purgeSandboxData(actor);

    const cleaned = await getSandboxStatus();
    expect(cleaned.hasDemoData).toBe(false);
    expect(cleaned.demoStockBags).toBe(0);
    expect(cleaned.demoSkuCount).toBe(0);
    expect(cleaned.demoPoCount).toBe(0);
    expect(cleaned.demoGrnCount).toBe(0);
    expect(cleaned.demoInvoiceCount).toBe(0);

    const survivingPo = await prisma.purchaseOrder.findUnique({
      where: { id: productionPo.id },
    });
    expect(survivingPo?.poNumber).toBe("PROD-PO-001");
  });
});
