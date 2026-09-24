import { beforeEach, describe, expect, it } from "vitest";
import type { Actor } from "@/server/actor";
import { prisma } from "@/server/db/client";
import { withTx } from "@/server/db/transaction";
import { nextDocumentNumber } from "@/server/modules/documents/documents.service";
import { importSkus } from "@/server/modules/imports/import.service";
import { createCustomer, createSku as createSkuMaster, createSupplier } from "@/server/modules/masters/masters.service";
import { allocateCode, previewNextCode, updateCodeSeries } from "@/server/modules/numbering/numbering.service";
import { actorFor, createSku, createUom, createUser } from "../../helpers/factories";
import { errorCode } from "../../helpers/scenario";

let admin: Actor;
beforeEach(async () => {
  admin = actorFor(await createUser("ADMIN"));
});

const date = new Date("2026-09-24T10:00:00Z");

describe("document numbers", () => {
  it("follow the default format, sequentially per series", async () => {
    const a = await withTx((tx) => nextDocumentNumber(tx, "GRN", date));
    const b = await withTx((tx) => nextDocumentNumber(tx, "GRN", date));
    const c = await withTx((tx) => nextDocumentNumber(tx, "PO", date));
    expect([a, b, c]).toEqual(["GRN-2026-000001", "GRN-2026-000002", "PO-2026-000001"]);
  });

  it("are unique and gap-free under concurrency", async () => {
    const numbers = await Promise.all(Array.from({ length: 50 }, () => withTx((tx) => nextDocumentNumber(tx, "DSP"))));
    const values = numbers.map((n) => Number(n.split("-")[2])).sort((x, y) => x - y);
    expect(values).toEqual(Array.from({ length: 50 }, (_, i) => i + 1));
  });

  it("are not consumed when the transaction rolls back", async () => {
    await withTx(async (tx) => {
      await nextDocumentNumber(tx, "ADJ");
      throw new Error("rollback");
    }).catch(() => undefined);
    expect(await withTx((tx) => nextDocumentNumber(tx, "ADJ"))).toMatch(/-000001$/);
  });

  it("use the format an administrator sets, restarting per financial year", async () => {
    await updateCodeSeries(admin, "INV", { prefix: "SI", pattern: "{PREFIX}/{FY}/{SEQ}", padding: 5 });
    expect(await withTx((tx) => nextDocumentNumber(tx, "INV", date))).toBe("SI/2627/00001");
    expect(await withTx((tx) => nextDocumentNumber(tx, "INV", new Date("2027-04-02T10:00:00Z")))).toBe("SI/2728/00001");
    expect(await prisma.auditLog.count({ where: { entityType: "CodeSeries" } })).toBe(1);
  });
});

describe("master codes", () => {
  it("skip codes that are already in use and preview the next free one", async () => {
    await createSku({ code: "SKU-000001" });
    await createSku({ code: "SKU-000002" });
    expect(await previewNextCode("SKU")).toBe("SKU-000003");
    expect(await withTx((tx) => allocateCode(tx, "SKU"))).toBe("SKU-000003");
    expect(await previewNextCode("SKU")).toBe("SKU-000004");
  });
});

describe("masters created without a code", () => {
  it("get the next code of their series; a typed code is kept", async () => {
    const uom = await createUom("PCS", 0);
    const auto = await createSkuMaster(admin, { name: "Widget", baseUomId: uom.id, isBatchTracked: false });
    const typed = await createSkuMaster(admin, { code: "WID-9", name: "Widget 9", baseUomId: uom.id, isBatchTracked: false });
    const supplier = await createSupplier(admin, { name: "Acme Supplies" });
    const customer = await createCustomer(admin, { name: "Beta Retail" });
    expect([auto.code, typed.code, supplier.code, customer.code]).toEqual(["SKU-000001", "WID-9", "SUP-000001", "CUS-000001"]);
  });

  it("get codes in CSV imports, never colliding with codes typed in the same file", async () => {
    await createUom("PCS", 0);
    const csv = ["code,name,unit", ",Auto one,PCS", "SKU-000001,Typed,PCS", ",Auto two,PCS"].join("\n");
    expect(await importSkus(admin, csv)).toEqual({ created: 3 });
    const skus = await prisma.sku.findMany({ orderBy: { code: "asc" }, select: { code: true, name: true } });
    expect(skus).toEqual([
      { code: "SKU-000001", name: "Typed" },
      { code: "SKU-000002", name: "Auto one" },
      { code: "SKU-000003", name: "Auto two" },
    ]);
  });
});

describe("series settings", () => {
  it("refuse patterns without {SEQ} and invoice numbers longer than GST allows", async () => {
    expect(await errorCode(updateCodeSeries(admin, "SKU", { prefix: "P", pattern: "{PREFIX}-X", padding: 4 }))).toBe(
      "VALIDATION_ERROR",
    );
    expect(
      await errorCode(updateCodeSeries(admin, "INV", { prefix: "INVOICE", pattern: "{PREFIX}-{YYYY}-{SEQ}", padding: 8 })),
    ).toBe("VALIDATION_ERROR");
    expect(await errorCode(updateCodeSeries(admin, "NOPE", { prefix: "X", pattern: "{SEQ}", padding: 3 }))).toBe("NOT_FOUND");
  });
});
