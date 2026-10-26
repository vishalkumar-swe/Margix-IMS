import type { Actor } from "@/server/actor";
import { prisma } from "@/server/db/client";
import { toDecimal } from "@/server/db/decimal";
import { withTx, type Tx } from "@/server/db/transaction";
import { recordAudit } from "@/server/modules/audit/audit.service";
import { postMovement } from "@/server/modules/inventory/ledger.service";

export interface SandboxStatus {
  hasDemoData: boolean;
  demoSkuCount: number;
  demoPoCount: number;
  demoGrnCount: number;
  demoInvoiceCount: number;
  demoStockBags: number;
}

const DEMO_SKU_CODE = "DEMO-BASMATI-01";
const DEMO_GODOWN_CODE = "DEMO-WH-01";
const DEMO_SUPPLIER_CODE = "DEMO-SUPPLIER-01";
const DEMO_CUSTOMER_CODE = "DEMO-CUSTOMER-01";
const DEMO_PO_NUMBER = "DEMO-PO-001";
const DEMO_GRN_NUMBER = "DEMO-GRN-001";
const DEMO_INV_NUMBER = "DEMO-INV-001";
const DEMO_BATCH_NUMBER = "DEMO-BATCH-2026A";

export async function getSandboxStatus(): Promise<SandboxStatus> {
  const [sku, po, grn, inv, balance] = await Promise.all([
    prisma.sku.findUnique({ where: { code: DEMO_SKU_CODE } }),
    prisma.purchaseOrder.findUnique({ where: { poNumber: DEMO_PO_NUMBER } }),
    prisma.grn.findUnique({ where: { grnNumber: DEMO_GRN_NUMBER } }),
    prisma.invoice.findUnique({ where: { invoiceNumber: DEMO_INV_NUMBER } }),
    prisma.stockBalance.findFirst({
      where: {
        sku: { code: DEMO_SKU_CODE },
      },
    }),
  ]);

  const hasDemoData = Boolean(sku || po || grn || inv);
  return {
    hasDemoData,
    demoSkuCount: sku ? 1 : 0,
    demoPoCount: po ? 1 : 0,
    demoGrnCount: grn ? 1 : 0,
    demoInvoiceCount: inv ? 1 : 0,
    demoStockBags: balance ? Number(balance.quantity) : 0,
  };
}

export async function seedSandboxData(actor: Actor): Promise<{ success: boolean; message: string }> {
  return withTx(async (tx: Tx) => {
    // 1. Resolve or create Base UOM
    let uom = await tx.uom.findUnique({ where: { code: "BAG" } });
    if (!uom) {
      uom = await tx.uom.findFirst({ orderBy: { code: "asc" } });
    }
    if (!uom) {
      uom = await tx.uom.create({
        data: {
          code: "BAG",
          name: "Bag (10kg)",
          decimalPlaces: 0,
        },
      });
    }

    // 2. Resolve Category
    let category = await tx.category.findFirst({ where: { name: "Grains & Pulses" } });
    if (!category) {
      category = await tx.category.findFirst();
    }

    // 3. Create or find Godown
    let godown = await tx.godown.findUnique({ where: { code: DEMO_GODOWN_CODE } });
    if (!godown) {
      godown = await tx.godown.create({
        data: {
          code: DEMO_GODOWN_CODE,
          name: "Demo Central Warehouse",
          address: "Sector 18, Northern Logistics Park",
          isActive: true,
          tallySyncEnabled: false,
        },
      });
    }

    // 4. Create or find SKU
    let sku = await tx.sku.findUnique({ where: { code: DEMO_SKU_CODE } });
    if (!sku) {
      sku = await tx.sku.create({
        data: {
          code: DEMO_SKU_CODE,
          name: "Royal Basmati Rice 10kg",
          description: "Premium aged long-grain basmati rice in 10kg sealed bag",
          baseUomId: uom.id,
          categoryId: category?.id,
          hsnCode: "100630",
          gstRate: toDecimal("5.00"),
          isBatchTracked: true,
          status: "ACTIVE",
          barcode: "8901234567890",
        },
      });
    }

    // 5. Create or find Supplier
    let supplier = await tx.supplier.findUnique({ where: { code: DEMO_SUPPLIER_CODE } });
    if (!supplier) {
      supplier = await tx.supplier.create({
        data: {
          code: DEMO_SUPPLIER_CODE,
          name: "Apex Agri Commodities Pvt Ltd",
          gstin: "07AAAAA0000A1Z5",
          stateCode: "07",
          email: "orders@apexagri.sample",
          phone: "9876543210",
          address: "14 Mandi Road, Narela, Delhi",
          isActive: true,
        },
      });
    }

    // 6. Create or find Customer
    let customer = await tx.customer.findUnique({ where: { code: DEMO_CUSTOMER_CODE } });
    if (!customer) {
      customer = await tx.customer.create({
        data: {
          code: DEMO_CUSTOMER_CODE,
          name: "Metro Retail Stores Ltd",
          gstin: "07BBBBB0000B1Z6",
          stateCode: "07",
          email: "procurement@metroretail.sample",
          phone: "9123456780",
          address: "Plot 88, Connaught Place, New Delhi",
          isActive: true,
        },
      });
    }

    // 7. Create Purchase Order (100 bags @ 650)
    let po = await tx.purchaseOrder.findUnique({
      where: { poNumber: DEMO_PO_NUMBER },
      include: { items: true },
    });
    if (!po) {
      po = await tx.purchaseOrder.create({
        data: {
          poNumber: DEMO_PO_NUMBER,
          supplierId: supplier.id,
          status: "OPEN",
          createdById: actor.userId,
          orderDate: new Date(),
          taxType: "INTRA",
          items: {
            create: [
              {
                lineNo: 1,
                skuId: sku.id,
                orderedQty: toDecimal("100"),
                receivedQty: toDecimal("100"),
                rate: toDecimal("650.00"),
                gstRate: toDecimal("5.00"),
                hsnCode: "100630",
              },
            ],
          },
        },
        include: { items: true },
      });
    }

    // 8. Create Batch
    let batch = await tx.batch.findUnique({
      where: {
        skuId_batchNumber: {
          skuId: sku.id,
          batchNumber: DEMO_BATCH_NUMBER,
        },
      },
    });
    if (!batch) {
      const now = new Date();
      const expiry = new Date();
      expiry.setFullYear(now.getFullYear() + 1);
      batch = await tx.batch.create({
        data: {
          skuId: sku.id,
          batchNumber: DEMO_BATCH_NUMBER,
          manufacturingDate: now,
          expiryDate: expiry,
        },
      });
    }

    // 9. Post Goods Receipt Note & Inward Ledger movement
    let grn = await tx.grn.findUnique({ where: { grnNumber: DEMO_GRN_NUMBER } });
    if (!grn) {
      const poItemId = po.items[0]?.id;
      if (!poItemId) {
        throw new Error("PO item missing for demo receipt");
      }

      grn = await tx.grn.create({
        data: {
          grnNumber: DEMO_GRN_NUMBER,
          purchaseOrderId: po.id,
          godownId: godown.id,
          createdById: actor.userId,
          status: "POSTED",
          receivedAt: new Date(),
          items: {
            create: [
              {
                purchaseOrderItemId: poItemId,
                skuId: sku.id,
                batchId: batch.id,
                receivedQty: toDecimal("100"),
                acceptedQty: toDecimal("100"),
                rejectedQty: toDecimal("0"),
              },
            ],
          },
        },
      });

      // Post immutable inward movement to update stock_balance and ledger
      await postMovement(tx, actor, {
        movementType: "INWARD",
        quantity: toDecimal("100"),
        reference: {
          type: "GRN",
          id: grn.id,
          no: grn.grnNumber,
        },
        key: {
          godownId: godown.id,
          skuId: sku.id,
          batchId: batch.id,
        },
        remarks: "Demo Sandbox Goods Receipt Inward",
      });
    }

    // 10. Create Sales Invoice (30 bags @ 850, OPEN and ready for Milestone 5 FEFO dispatch)
    let inv = await tx.invoice.findUnique({ where: { invoiceNumber: DEMO_INV_NUMBER } });
    if (!inv) {
      inv = await tx.invoice.create({
        data: {
          invoiceNumber: DEMO_INV_NUMBER,
          customerId: customer.id,
          createdById: actor.userId,
          status: "OPEN",
          invoiceDate: new Date(),
          taxType: "INTRA",
          placeOfSupply: "07",
          items: {
            create: [
              {
                lineNo: 1,
                skuId: sku.id,
                quantity: toDecimal("30"),
                dispatchedQty: toDecimal("0"),
                rate: toDecimal("850.00"),
                gstRate: toDecimal("5.00"),
                hsnCode: "100630",
              },
            ],
          },
        },
      });
    }

    await recordAudit(tx, actor, {
      action: "COPILOT_SANDBOX_SEEDED",
      entityType: "Sandbox",
      entityId: "DEMO-ENVIRONMENT",
      newData: { sku: sku.code, po: po.poNumber, grn: grn.grnNumber, invoice: inv.invoiceNumber },
    });

    return {
      success: true,
      message: "Sandbox environment seeded with 100 bags stock and ready-to-dispatch invoice.",
    };
  });
}

export async function purgeSandboxData(actor: Actor): Promise<{ success: boolean; purgedCount: number }> {
  return withTx(async (tx: Tx) => {
    let purged = 0;

    // 1. Find demo SKU & Godown
    const [sku, godown] = await Promise.all([
      tx.sku.findUnique({ where: { code: DEMO_SKU_CODE } }),
      tx.godown.findUnique({ where: { code: DEMO_GODOWN_CODE } }),
    ]);

    // 2. Delete Outward / Dispatches
    const outwards = await tx.outward.findMany({
      where: {
        OR: [
          { outwardNumber: { startsWith: "DEMO-" } },
          sku ? { items: { some: { skuId: sku.id } } } : {},
        ],
      },
      select: { id: true },
    });
    if (outwards.length > 0) {
      const ids = outwards.map((o) => o.id);
      await tx.inventoryLedger.deleteMany({ where: { referenceType: "DISPATCH", referenceId: { in: ids } } });
      await tx.outwardItem.deleteMany({ where: { outwardId: { in: ids } } });
      const delOut = await tx.outward.deleteMany({ where: { id: { in: ids } } });
      purged += delOut.count;
    }

    // 3. Delete Invoices
    const invoices = await tx.invoice.findMany({
      where: {
        OR: [
          { invoiceNumber: { startsWith: "DEMO-" } },
          sku ? { items: { some: { skuId: sku.id } } } : {},
        ],
      },
      select: { id: true },
    });
    if (invoices.length > 0) {
      const ids = invoices.map((i) => i.id);
      await tx.invoiceItem.deleteMany({ where: { invoiceId: { in: ids } } });
      const delInv = await tx.invoice.deleteMany({ where: { id: { in: ids } } });
      purged += delInv.count;
    }

    // 4. Delete GRNs
    const grns = await tx.grn.findMany({
      where: {
        OR: [
          { grnNumber: { startsWith: "DEMO-" } },
          sku ? { items: { some: { skuId: sku.id } } } : {},
        ],
      },
      select: { id: true },
    });
    if (grns.length > 0) {
      const ids = grns.map((g) => g.id);
      await tx.inventoryLedger.deleteMany({ where: { referenceType: "GRN", referenceId: { in: ids } } });
      await tx.grnItem.deleteMany({ where: { grnId: { in: ids } } });
      const delGrn = await tx.grn.deleteMany({ where: { id: { in: ids } } });
      purged += delGrn.count;
    }

    // 5. Delete Purchase Orders
    const pos = await tx.purchaseOrder.findMany({
      where: {
        OR: [
          { poNumber: { startsWith: "DEMO-" } },
          sku ? { items: { some: { skuId: sku.id } } } : {},
        ],
      },
      select: { id: true },
    });
    if (pos.length > 0) {
      const ids = pos.map((p) => p.id);
      await tx.purchaseOrderItem.deleteMany({ where: { purchaseOrderId: { in: ids } } });
      const delPo = await tx.purchaseOrder.deleteMany({ where: { id: { in: ids } } });
      purged += delPo.count;
    }

    // 6. Delete Stock Balances and Batches for demo SKU
    if (sku) {
      await tx.inventoryLedger.deleteMany({ where: { skuId: sku.id } });
      await tx.stockBalance.deleteMany({ where: { skuId: sku.id } });
      await tx.stockAlert.deleteMany({ where: { skuId: sku.id } });
      await tx.batch.deleteMany({ where: { skuId: sku.id } });
      await tx.sku.delete({ where: { id: sku.id } });
      purged += 1;
    }

    // 7. Delete Customer & Supplier
    const [delCust, delSupp] = await Promise.all([
      tx.customer.deleteMany({ where: { code: DEMO_CUSTOMER_CODE } }),
      tx.supplier.deleteMany({ where: { code: DEMO_SUPPLIER_CODE } }),
    ]);
    purged += delCust.count + delSupp.count;

    // 8. Delete Godown if no other stock
    if (godown) {
      const remainingBalances = await tx.stockBalance.count({ where: { godownId: godown.id } });
      if (remainingBalances === 0) {
        await tx.godown.delete({ where: { id: godown.id } });
        purged += 1;
      }
    }

    await recordAudit(tx, actor, {
      action: "COPILOT_SANDBOX_PURGED",
      entityType: "Sandbox",
      entityId: "DEMO-ENVIRONMENT",
      oldData: { purgedRecords: purged },
    });

    return {
      success: true,
      purgedCount: purged,
    };
  });
}
