import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db/client";
import { postDispatch } from "@/server/modules/dispatch/dispatch.service";
import { cancelInvoice, createInvoice } from "@/server/modules/invoices/invoice.service";
import { reverseEntry } from "@/server/modules/reversals/reversals.service";
import { findStockDrift } from "../../helpers/database";
import { createBatch, createCustomer, createSku } from "../../helpers/factories";
import { errorCode, stockedScenario, stockOf, type StockedScenario } from "../../helpers/scenario";

let s: StockedScenario;
let customerId: string;

beforeEach(async () => {
  s = await stockedScenario("100");
  customerId = (await createCustomer()).id;
});

const invoiceFor = (quantity: string, skuId = s.sku.id) =>
  createInvoice(s.manager, { customerId, invoiceDate: "2026-09-24", items: [{ skuId, quantity }] });

const dispatchAgainst = (invoiceId: string, quantity: string, extra: { customerId?: string } = {}) =>
  postDispatch(s.operator, {
    godownId: s.godown.id,
    invoiceId,
    ...extra,
    items: [{ skuId: s.sku.id, batchId: s.batch.id, quantity }],
  });

const invoiceState = async (id: string) => {
  const invoice = await prisma.invoice.findUniqueOrThrow({ where: { id }, include: { items: true } });
  return { status: invoice.status, dispatched: invoice.items[0].dispatchedQty.toString() };
};

describe("invoice partial dispatch (spec §6.2)", () => {
  it("tracks dispatched and remaining quantity until complete", async () => {
    const invoice = await invoiceFor("60");
    expect(invoice.status).toBe("OPEN");
    expect(invoice.invoiceNumber).toMatch(/^INV-\d{4}-00001$/);

    const first = await dispatchAgainst(invoice.id, "25");
    expect(await invoiceState(invoice.id)).toEqual({ status: "PARTIALLY_DISPATCHED", dispatched: "25" });
    expect(first.customerId).toBe(customerId);
    expect(first.invoiceId).toBe(invoice.id);

    await dispatchAgainst(invoice.id, "35");
    expect(await invoiceState(invoice.id)).toEqual({ status: "COMPLETE", dispatched: "60" });
    expect(await stockOf(s.sku.id, s.godown.id, s.batch.id)).toBe("40");
    expect(await errorCode(dispatchAgainst(invoice.id, "1"))).toBe("INVALID_STATE");
  });

  it("blocks dispatch beyond the remaining invoiced quantity", async () => {
    const invoice = await invoiceFor("30");
    await dispatchAgainst(invoice.id, "20");

    const error = await dispatchAgainst(invoice.id, "11").catch((e: { code: string; details: unknown }) => e);
    expect(error).toMatchObject({
      code: "OVER_DISPATCH",
      details: { invoiced: "30", alreadyDispatched: "20", remaining: "10", dispatching: "11" },
    });
    expect(await stockOf(s.sku.id, s.godown.id, s.batch.id)).toBe("80");
  });

  it("rejects SKUs not on the invoice and a mismatched customer", async () => {
    const invoice = await invoiceFor("10");
    const other = await createSku();
    const otherBatch = await createBatch(other.id);
    expect(
      await errorCode(
        postDispatch(s.operator, {
          godownId: s.godown.id,
          invoiceId: invoice.id,
          items: [{ skuId: other.id, batchId: otherBatch.id, quantity: "1" }],
        }),
      ),
    ).toBe("VALIDATION_ERROR");

    const stranger = await createCustomer();
    expect(await errorCode(dispatchAgainst(invoice.id, "1", { customerId: stranger.id }))).toBe("VALIDATION_ERROR");
  });

  it("gives the quantity back to the invoice when a dispatch line is reversed", async () => {
    const invoice = await invoiceFor("50");
    await dispatchAgainst(invoice.id, "50");
    const entry = await prisma.inventoryLedger.findFirstOrThrow({ where: { movementType: "OUTWARD" } });

    await reverseEntry(s.manager, entry.id, "Wrong customer");

    expect(await invoiceState(invoice.id)).toEqual({ status: "OPEN", dispatched: "0" });
    expect(await stockOf(s.sku.id, s.godown.id, s.batch.id)).toBe("100");
    expect(await findStockDrift()).toEqual([]);
  });

  it("never over-dispatches under concurrent dispatches", async () => {
    const invoice = await invoiceFor("40");
    const results = await Promise.allSettled(Array.from({ length: 5 }, () => dispatchAgainst(invoice.id, "10")));

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(4);
    expect(await invoiceState(invoice.id)).toEqual({ status: "COMPLETE", dispatched: "40" });
  });

  it("can be cancelled only while nothing has been dispatched", async () => {
    const untouched = await invoiceFor("5");
    expect((await cancelInvoice(s.manager, untouched.id, "Order withdrawn")).status).toBe("CANCELLED");
    expect(await errorCode(dispatchAgainst(untouched.id, "1"))).toBe("INVALID_STATE");

    const started = await invoiceFor("5");
    await dispatchAgainst(started.id, "1");
    expect(await errorCode(cancelInvoice(s.manager, started.id, "x"))).toBe("INVALID_STATE");
  });
});
