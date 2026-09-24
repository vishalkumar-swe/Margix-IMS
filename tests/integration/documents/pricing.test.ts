import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST as invoicesPost } from "@/app/api/v1/invoices/route";
import { POST as purchaseOrdersPost } from "@/app/api/v1/purchase-orders/route";
import type { Actor } from "@/server/actor";
import { prisma } from "@/server/db/client";
import { postDispatch } from "@/server/modules/dispatch/dispatch.service";
import {
  dispatchPricing,
  grnPricing,
  invoicePricing,
  purchaseOrderPricing,
} from "@/server/modules/documents/pricing";
import { getDispatchDetail } from "@/server/modules/dispatch/dispatch.queries";
import { createInvoice } from "@/server/modules/invoices/invoice.service";
import { getInvoiceDetail } from "@/server/modules/invoices/invoice.queries";
import { updateCustomer, updateSku } from "@/server/modules/masters/masters.service";
import { postOpeningBalance } from "@/server/modules/opening/opening.service";
import { postGrn } from "@/server/modules/purchasing/grn.service";
import { createPurchaseOrder, updateDraftPurchaseOrder } from "@/server/modules/purchasing/purchase-order.service";
import { getGrnDetail, getPurchaseOrderDetail } from "@/server/modules/purchasing/purchasing.queries";
import {
  actorFor,
  createCustomer,
  createGodown,
  createHsn,
  createSku,
  createSupplier,
  createUom,
  createUser,
} from "../../helpers/factories";
import { callRoute, sessionCookieFor } from "../../helpers/http";

// The company is in Karnataka (29); read once, before anything else uses the environment.
vi.stubEnv("COMPANY_GSTIN", "");
vi.stubEnv("COMPANY_STATE_CODE", "29");

const KARNATAKA_GSTIN = "29AABCR5678K1Z2";
const MAHARASHTRA_GSTIN = "27AAACG1234F1Z5";

let admin: Actor;
let skuId: string;

beforeEach(async () => {
  admin = actorFor(await createUser("ADMIN"));
  await createHsn("3901", "18");
  const sku = await createSku({ code: "RM-001" });
  await prisma.sku.update({ where: { id: sku.id }, data: { hsnCode: "3901", gstRate: "18" } });
  skuId = sku.id;
});

const order = (supplierId: string, extra: Record<string, unknown> = {}) =>
  createPurchaseOrder(admin, {
    supplierId,
    orderDate: "2026-09-27",
    submit: true,
    otherCharges: "2500",
    otherChargesLabel: "Freight",
    items: [{ skuId, orderedQty: "1000", rate: "145.50", discountPercent: "2.5" }],
    ...extra,
  });

const poPricing = async (id: string) => purchaseOrderPricing((await getPurchaseOrderDetail(id))!);
const invPricing = async (id: string) => invoicePricing((await getInvoiceDetail(id))!);

describe("purchase order pricing", () => {
  it("is inter-state (IGST) for a supplier in another state, with discount and other charges", async () => {
    const po = await order((await createSupplier({ gstin: MAHARASHTRA_GSTIN })).id);
    expect(po).toMatchObject({ taxType: "INTER", placeOfSupply: "29", otherChargesLabel: "Freight" });
    expect(po.otherCharges.toString()).toBe("2500");

    const [item] = await prisma.purchaseOrderItem.findMany({ where: { purchaseOrderId: po.id } });
    expect(item.discountPercent.toString()).toBe("2.5");
    // HSN and GST rate copied from the product when the line has none of its own.
    expect(item.hsnCode).toBe("3901");
    expect(item.gstRate?.toString()).toBe("18");

    const { summary } = await poPricing(po.id);
    expect(summary).toMatchObject({
      taxType: "INTER",
      subtotal: "145500.00",
      discount: "3637.50",
      taxable: "141862.50",
      cgst: "0.00",
      sgst: "0.00",
      igst: "25535.25",
      otherCharges: "2500.00",
      grandTotal: "169897.75",
    });

    const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: "PO_CREATED", entityId: po.id } });
    expect(audit.newData).toMatchObject({ totals: { grandTotal: "169897.75", igst: "25535.25" } });
  });

  it("is intra-state (CGST + SGST) for a supplier in our state, known by GSTIN or by state code", async () => {
    for (const gst of [{ gstin: KARNATAKA_GSTIN }, { stateCode: "29" }]) {
      const po = await order((await createSupplier(gst)).id);
      expect(po.taxType).toBe("INTRA");
      expect((await poPricing(po.id)).summary).toMatchObject({
        cgst: "12767.63",
        sgst: "12767.63",
        igst: "0.00",
        grandTotal: "169897.76",
      });
    }
  });

  it("treats an unknown supplier state as intra-state", async () => {
    const po = await order((await createSupplier()).id);
    expect(po).toMatchObject({ taxType: "INTRA", placeOfSupply: "29" });
  });

  it("re-decides the tax terms when a draft changes supplier", async () => {
    const local = await createSupplier({ stateCode: "29" });
    const draft = await order(local.id, { submit: false });
    expect(draft.taxType).toBe("INTRA");

    const remote = await createSupplier({ gstin: MAHARASHTRA_GSTIN });
    const updated = await updateDraftPurchaseOrder(admin, draft.id, {
      supplierId: remote.id,
      orderDate: "2026-09-27",
      items: [{ skuId, orderedQty: "10", rate: "100" }],
    });
    expect(updated).toMatchObject({ taxType: "INTER", otherChargesLabel: null });
    expect(updated.otherCharges.toString()).toBe("0");
    expect((await poPricing(draft.id)).summary).toMatchObject({ igst: "180.00", grandTotal: "1180.00" });
  });

  it("values a GRN at the order's price per entered unit", async () => {
    const box = await createUom("BOX", 0);
    const pcs = await createSku({ code: "FG-001", uomCode: "PCS" });
    await prisma.skuUnit.create({ data: { skuId: pcs.id, uomId: box.id, factor: "24" } });
    const po = await createPurchaseOrder(admin, {
      supplierId: (await createSupplier({ stateCode: "29" })).id,
      orderDate: "2026-09-27",
      submit: true,
      items: [{ skuId: pcs.id, orderedQty: "2", uomId: box.id, rate: "240", gstRate: "12" }],
    });
    expect((await poPricing(po.id)).lines[0]).toMatchObject({ quantity: "2", unit: "BOX", tax: { taxable: "480.00" } });

    const [item] = await prisma.purchaseOrderItem.findMany({ where: { purchaseOrderId: po.id } });
    const grn = await postGrn(admin, po.id, {
      godownId: (await createGodown()).id,
      items: [{ purchaseOrderItemId: item.id, batchNumber: "B-1", receivedQty: "30", acceptedQty: "30" }],
    });
    const view = grnPricing((await getGrnDetail(grn.id))!);
    // 30 PCS of a ₹240 BOX of 24 = ₹300, + 6% + 6%.
    expect(view.lines[0]).toMatchObject({ quantity: "30", unit: "PCS", rateUnit: "BOX" });
    expect(view.summary).toMatchObject({ taxable: "300.00", cgst: "18.00", sgst: "18.00", grandTotal: "336.00" });
  });

  it("rejects a discount over 100% and negative other charges", async () => {
    const cookie = await sessionCookieFor(admin.userId);
    const supplierId = (await createSupplier()).id;
    const body = { supplierId, orderDate: "2026-09-27", items: [{ skuId, orderedQty: "1", rate: "10", discountPercent: "101" }] };
    const tooMuch = await callRoute(purchaseOrdersPost, { cookie, body });
    expect(tooMuch.status).toBe(400);
    expect(JSON.stringify(tooMuch.json.error?.details)).toContain("items.0.discountPercent");

    const negative = await callRoute(purchaseOrdersPost, {
      cookie,
      body: { ...body, otherCharges: "-5", items: [{ skuId, orderedQty: "1" }] },
    });
    expect(negative.status).toBe(400);
    expect(JSON.stringify(negative.json.error?.details)).toContain("otherCharges");
  });
});

describe("invoice pricing", () => {
  const invoiceFor = (customerId: string) =>
    createInvoice(admin, {
      customerId,
      invoiceDate: "2026-09-27",
      otherCharges: "100",
      items: [{ skuId, quantity: "10", rate: "100", discountPercent: "10", gstRate: "18" }],
    });

  it("is intra-state for a customer in our state and inter-state otherwise, with the customer's state as place of supply", async () => {
    const local = await invoiceFor((await createCustomer({ gstin: KARNATAKA_GSTIN })).id);
    expect(local).toMatchObject({ taxType: "INTRA", placeOfSupply: "29" });
    expect((await invPricing(local.id)).summary).toMatchObject({
      subtotal: "1000.00",
      discount: "100.00",
      taxable: "900.00",
      cgst: "81.00",
      sgst: "81.00",
      otherCharges: "100.00",
      grandTotal: "1162.00",
    });

    const remote = await invoiceFor((await createCustomer({ stateCode: "27" })).id);
    expect(remote).toMatchObject({ taxType: "INTER", placeOfSupply: "27" });
    expect((await invPricing(remote.id)).summary).toMatchObject({ igst: "162.00", grandTotal: "1162.00" });
  });

  it("keeps its tax terms, HSN and rate when the masters change later", async () => {
    const customer = await createCustomer({ stateCode: "29" });
    const invoice = await invoiceFor(customer.id);

    await updateCustomer(admin, customer.id, { stateCode: "27" });
    await createHsn("3923", "12");
    await updateSku(admin, skuId, { hsnCode: "3923" });

    const stored = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id }, include: { items: true } });
    expect(stored).toMatchObject({ taxType: "INTRA", placeOfSupply: "29" });
    expect(stored.items[0].hsnCode).toBe("3901");
    expect(stored.items[0].gstRate?.toString()).toBe("18");
  });

  it("values a dispatch at the invoice's prices", async () => {
    const invoice = await invoiceFor((await createCustomer({ stateCode: "27" })).id);
    const godown = await createGodown();
    await postOpeningBalance(admin, { godownId: godown.id, asOf: "2026-04-01", items: [{ skuId, batchNumber: "B-1", quantity: "50" }] });
    const batch = await prisma.batch.findFirstOrThrow({ where: { skuId, batchNumber: "B-1" } });

    const dispatch = await postDispatch(admin, {
      godownId: godown.id,
      invoiceId: invoice.id,
      items: [{ skuId, batchId: batch.id, quantity: "4" }],
    });
    const view = dispatchPricing((await getDispatchDetail(dispatch.id))!);
    // 4 × ₹100 − 10% = 360, IGST 18% = 64.80 (no other charges on a delivery note).
    expect(view?.summary).toMatchObject({ taxable: "360.00", igst: "64.80", otherCharges: "0.00", grandTotal: "424.80" });
  });

  it("accepts discounts and other charges through the API", async () => {
    const cookie = await sessionCookieFor(admin.userId);
    const customerId = (await createCustomer({ gstin: MAHARASHTRA_GSTIN })).id;
    const response = await callRoute<{ id: string; taxType: string; otherChargesLabel: string }>(invoicesPost, {
      cookie,
      body: {
        customerId,
        invoiceDate: "2026-09-27",
        otherCharges: "50.5",
        otherChargesLabel: "Packing",
        items: [{ skuId, quantity: "2", rate: "10", discountPercent: "5" }],
      },
    });
    expect(response.status).toBe(201);
    expect(response.json.data).toMatchObject({ taxType: "INTER", otherChargesLabel: "Packing" });
    expect((await invPricing(response.json.data!.id)).summary).toMatchObject({
      taxable: "19.00",
      igst: "3.42",
      grandTotal: "72.92",
    });
  });
});
