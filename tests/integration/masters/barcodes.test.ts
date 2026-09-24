import { beforeEach, describe, expect, it } from "vitest";
import { POST as customersPost } from "@/app/api/v1/customers/route";
import { POST as generateOnePost } from "@/app/api/v1/skus/[id]/barcode/route";
import { PATCH as skuPatch } from "@/app/api/v1/skus/[id]/route";
import { POST as generateMissingPost } from "@/app/api/v1/skus/barcodes/route";
import { POST as skusPost } from "@/app/api/v1/skus/route";
import { isValidEan13 } from "@/lib/barcode";
import type { Actor } from "@/server/actor";
import { prisma } from "@/server/db/client";
import {
  createCustomer,
  createSku,
  createSupplier,
  generateMissingSkuBarcodes,
  generateSkuBarcode,
  updateSku,
} from "@/server/modules/masters/masters.service";
import { actorFor, createSku as createSkuRow, createUom, createUser } from "../../helpers/factories";
import { callRoute, sessionCookieFor } from "../../helpers/http";
import { errorCode } from "../../helpers/scenario";

let admin: Actor;
let baseUomId: string;

beforeEach(async () => {
  admin = actorFor(await createUser("ADMIN"));
  baseUomId = (await createUom("PCS", 0)).id;
});

const newSku = (extra: { barcode?: string } = {}) =>
  createSku(admin, { name: "Bottle", baseUomId, isBatchTracked: false, ...extra });

describe("product barcodes", () => {
  it("generates a unique internal EAN-13 for every new product without one", async () => {
    const first = await newSku();
    const second = await newSku();
    expect(first.barcode).toBe("2000000000015");
    expect(second.barcode).toBe("2000000000022");
    for (const sku of [first, second]) expect(isValidEan13(sku.barcode!)).toBe(true);
  });

  it("keeps a barcode that was given and skips it when generating", async () => {
    const own = await newSku({ barcode: "2000000000015" });
    expect(own.barcode).toBe("2000000000015");
    expect((await newSku()).barcode).toBe("2000000000022");
  });

  it("refuses a barcode another product already has, against the barcode field", async () => {
    const taken = await newSku({ barcode: "RM-BAR-1" });
    const error = await newSku({ barcode: "RM-BAR-1" }).catch((e: { code: string; details: unknown }) => e);
    expect(error).toMatchObject({ code: "VALIDATION_ERROR", details: [{ path: "barcode" }] });

    const other = await newSku();
    expect(await errorCode(updateSku(admin, other.id, { barcode: "RM-BAR-1" }))).toBe("VALIDATION_ERROR");
    // Saving a product with its own barcode is not a clash; clearing is allowed.
    expect(await errorCode(updateSku(admin, taken.id, { barcode: "RM-BAR-1", name: "Renamed" }))).toBe("OK");
    expect((await updateSku(admin, taken.id, { barcode: null })).barcode).toBeNull();
  });

  it("validates EAN-13 check digits and characters through the API", async () => {
    const cookie = await sessionCookieFor(admin.userId);
    const bad = await callRoute(skusPost, { cookie, body: { name: "X", baseUomId, barcode: "4006381333932" } });
    expect(bad.status).toBe(400);
    expect(JSON.stringify(bad.json.error?.details)).toContain("check digit");

    const good = await callRoute<{ id: string; barcode: string }>(skusPost, {
      cookie,
      body: { name: "X", baseUomId, barcode: "4006381333931" },
    });
    expect(good.status).toBe(201);
    const spaced = await callRoute(skuPatch, {
      method: "PATCH",
      cookie,
      params: { id: good.json.data!.id },
      body: { barcode: "A B" },
    });
    expect(spaced.status).toBe(400);
  });

  it("generates a new barcode for one product only when asked to replace an existing one", async () => {
    const sku = await newSku({ barcode: "OLD-1" });
    expect(await errorCode(generateSkuBarcode(admin, sku.id, { replace: false }))).toBe("INVALID_STATE");
    const replaced = await generateSkuBarcode(admin, sku.id, { replace: true });
    expect(replaced.barcode).toBe("2000000000015");

    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { entityId: sku.id, action: "MASTER_UPDATED" },
      orderBy: { createdAt: "desc" },
    });
    expect(audit).toMatchObject({ oldData: { barcode: "OLD-1" }, newData: { barcode: "2000000000015" } });

    const cookie = await sessionCookieFor(admin.userId);
    const viaApi = await callRoute<{ barcode: string }>(generateOnePost, {
      cookie,
      params: { id: sku.id },
      body: { replace: true },
    });
    expect(viaApi.json.data?.barcode).toBe("2000000000022");
  });

  it("fills in missing barcodes for all products that are not archived", async () => {
    const withBarcode = await newSku({ barcode: "KEEP-1" });
    const missing = await createSkuRow({ code: "IMP-1" });
    const archived = await createSkuRow({ code: "IMP-2", status: "ARCHIVED" });

    expect(await generateMissingSkuBarcodes(admin)).toEqual({ count: 1 });
    const rows = await prisma.sku.findMany({ where: { id: { in: [withBarcode.id, missing.id, archived.id] } } });
    const byId = new Map(rows.map((r) => [r.id, r.barcode]));
    expect(byId.get(withBarcode.id)).toBe("KEEP-1");
    expect(isValidEan13(byId.get(missing.id)!)).toBe(true);
    expect(byId.get(archived.id)).toBeNull();
    expect(await generateMissingSkuBarcodes(admin)).toEqual({ count: 0 });

    const operator = await sessionCookieFor((await createUser("WAREHOUSE_OPERATOR")).id);
    expect((await callRoute(generateMissingPost, { cookie: operator, method: "POST" })).status).toBe(403);
  });
});

describe("party GST state", () => {
  it("takes the state from the GSTIN and otherwise keeps the chosen state", async () => {
    const withGstin = await createSupplier(admin, { name: "A", gstin: "27AAACG1234F1Z5", stateCode: "29" });
    expect(withGstin.stateCode).toBe("27");
    const withoutGstin = await createCustomer(admin, { name: "B", stateCode: "33" });
    expect(withoutGstin.stateCode).toBe("33");
  });

  it("rejects state codes that are not GST states", async () => {
    const cookie = await sessionCookieFor(admin.userId);
    const response = await callRoute(customersPost, { cookie, body: { name: "C", stateCode: "99" } });
    expect(response.status).toBe(400);
    expect(JSON.stringify(response.json.error?.details)).toContain("stateCode");
  });
});
