import { beforeEach, describe, expect, it } from "vitest";
import { GET as documentLookup } from "@/app/api/v1/documents/lookup/route";
import { GET as skuLookup } from "@/app/api/v1/skus/lookup/route";
import { buildDocumentQrPayload } from "@/lib/document-codes";
import { prisma } from "@/server/db/client";
import { postDispatch } from "@/server/modules/dispatch/dispatch.service";
import { findDocumentByCode } from "@/server/modules/documents/documents.queries";
import { createInvoice } from "@/server/modules/invoices/invoice.service";
import { createPurchaseOrder } from "@/server/modules/purchasing/purchase-order.service";
import { createCustomer, createSupplier } from "../../helpers/factories";
import { callRoute, sessionCookieFor } from "../../helpers/http";
import { stockedScenario, type StockedScenario } from "../../helpers/scenario";

let s: StockedScenario;
let cookie: string;

beforeEach(async () => {
  s = await stockedScenario("100");
  cookie = await sessionCookieFor(s.operator.userId);
  await prisma.sku.update({ where: { id: s.sku.id }, data: { barcode: "8901234567890" } });
});

const lookup = (handler: typeof skuLookup, code: string, auth = cookie) =>
  callRoute<Record<string, unknown>>(handler, { cookie: auth, path: `/api/v1/x?${new URLSearchParams({ code })}` });

describe("GET /api/v1/skus/lookup", () => {
  it("finds a product by barcode or by SKU code, whatever the case of the code", async () => {
    for (const code of ["8901234567890", s.sku.code, s.sku.code.toLowerCase()]) {
      const response = await lookup(skuLookup, code);
      expect(response.status).toBe(200);
      expect(response.json.data).toMatchObject({ id: s.sku.id, code: s.sku.code, barcode: "8901234567890", status: "ACTIVE" });
    }
  });

  it("answers 404 for an unknown code and 400 without one", async () => {
    expect((await lookup(skuLookup, "0000000000000")).status).toBe(404);
    expect((await callRoute(skuLookup, { cookie, path: "/api/v1/x" })).status).toBe(400);
  });

  it("reports inactive products with their status", async () => {
    await prisma.sku.update({ where: { id: s.sku.id }, data: { status: "INACTIVE" } });
    expect((await lookup(skuLookup, "8901234567890")).json.data).toMatchObject({ status: "INACTIVE" });
  });

  it("requires a session", async () => {
    expect((await lookup(skuLookup, "8901234567890", "")).status).toBe(401);
  });
});

describe("GET /api/v1/documents/lookup", () => {
  it("resolves document numbers and QR payloads across document types", async () => {
    const po = await createPurchaseOrder(s.manager, {
      supplierId: (await createSupplier()).id,
      orderDate: "2026-09-27",
      submit: false,
      items: [{ skuId: s.sku.id, orderedQty: "5" }],
    });
    const invoice = await createInvoice(s.manager, {
      customerId: (await createCustomer()).id,
      invoiceDate: "2026-09-27",
      items: [{ skuId: s.sku.id, quantity: "5" }],
    });
    const dispatch = await postDispatch(s.operator, {
      godownId: s.godown.id,
      invoiceId: invoice.id,
      items: [{ skuId: s.sku.id, batchId: s.batch.id, quantity: "5" }],
    });

    expect((await lookup(documentLookup, po.poNumber)).json.data).toEqual({
      type: "PO",
      id: po.id,
      number: po.poNumber,
      url: `/purchase-orders/${po.id}`,
    });
    expect((await lookup(documentLookup, dispatch.outwardNumber.toLowerCase())).json.data).toMatchObject({
      type: "DSP",
      url: `/dispatches/${dispatch.id}`,
    });
    const qr = buildDocumentQrPayload({ type: "INV", number: invoice.invoiceNumber, date: "2026-09-27", total: "0.00" });
    expect((await lookup(documentLookup, qr)).json.data).toMatchObject({ type: "INV", id: invoice.id });
  });

  it("trusts the type in a QR payload", async () => {
    const invoice = await createInvoice(s.manager, {
      customerId: (await createCustomer()).id,
      invoiceDate: "2026-09-27",
      items: [{ skuId: s.sku.id, quantity: "1" }],
    });
    // The same number under another type is not the invoice.
    expect(await findDocumentByCode(`MARGIX|PO|${invoice.invoiceNumber}|2026-09-27|-|-`)).toBeNull();
    expect(await findDocumentByCode(`MARGIX|INV|${invoice.invoiceNumber}|2026-09-27|-|-`)).toMatchObject({ id: invoice.id });
  });

  it("answers 404 when nothing matches", async () => {
    expect((await lookup(documentLookup, "INV-1999-000001")).status).toBe(404);
    expect((await lookup(documentLookup, "MARGIX|NOPE|X|-|-|-")).status).toBe(404);
  });
});
