import { beforeEach, describe, expect, it } from "vitest";
import type { Actor } from "@/server/actor";
import { prisma } from "@/server/db/client";
import { suggestHsnCodes } from "@/server/modules/hsn/hsn.queries";
import { updateHsnCode } from "@/server/modules/hsn/hsn.service";
import { importHsnCodes, importSkus } from "@/server/modules/imports/import.service";
import { createCategory, createSku, updateSku } from "@/server/modules/masters/masters.service";
import type { AppError } from "@/server/errors";
import { actorFor, createHsn, createUom, createUser } from "../../helpers/factories";

let admin: Actor;
let pcs: string;
beforeEach(async () => {
  admin = actorFor(await createUser("ADMIN"));
  pcs = (await createUom("PCS", 0)).id;
  await createHsn("3923", "18", "Articles for the conveyance or packing of goods, of plastics");
  await createHsn("4819", "12", "Cartons, boxes and cases of paper or paperboard");
  await prisma.hsnCode.update({ where: { code: "4819" }, data: { keywords: "carton box corrugated" } });
});

const failure = (p: Promise<unknown>) => p.then(() => null, (e: AppError) => e);
const newSku = (fields: Partial<Parameters<typeof createSku>[1]> = {}) =>
  createSku(admin, { name: "Bottle 1L", baseUomId: pcs, isBatchTracked: false, ...fields });

describe("products and the HSN master", () => {
  it("take the HSN rate unless a rate is given deliberately", async () => {
    const following = await newSku({ hsnCode: "3923" });
    const overriding = await newSku({ name: "Bottle 2L", hsnCode: "3923", gstRate: "5" });
    expect([following.gstRate?.toString(), overriding.gstRate?.toString()]).toEqual(["18", "5"]);
  });

  it("refuse unknown or inactive HSN codes, reported on the HSN field", async () => {
    const unknown = await failure(newSku({ hsnCode: "9999" }));
    expect(unknown?.code).toBe("VALIDATION_ERROR");
    expect(unknown?.details).toEqual([expect.objectContaining({ path: "hsnCode" })]);

    await updateHsnCode(admin, "4819", { isActive: false });
    expect((await failure(newSku({ hsnCode: "4819" })))?.code).toBe("VALIDATION_ERROR");
  });

  it("switch to the new HSN's rate when the HSN changes", async () => {
    const sku = await newSku({ hsnCode: "3923" });
    const after = await updateSku(admin, sku.id, { hsnCode: "4819" });
    expect([after.hsnCode, after.gstRate?.toString()]).toEqual(["4819", "12"]);
  });

  it("follow an HSN rate change, while deliberate overrides stay", async () => {
    const following = await newSku({ hsnCode: "3923" });
    const overriding = await newSku({ name: "Bottle 2L", hsnCode: "3923", gstRate: "5" });
    await updateHsnCode(admin, "3923", { gstRate: "5.5" });
    const [a, b] = await Promise.all(
      [following, overriding].map((s) => prisma.sku.findUniqueOrThrow({ where: { id: s.id } })),
    );
    expect([a.gstRate?.toString(), b.gstRate?.toString()]).toEqual(["5.5", "5"]);
  });
});

describe("HSN suggestions", () => {
  it("rank the category default first, then codes used for similar products, then description matches", async () => {
    const packaging = await createCategory(admin, { name: "Packaging", hsnCode: "4819" });
    await newSku({ name: "PET bottle 500ml", hsnCode: "3923" });

    const suggestions = await suggestHsnCodes({ name: "Bottle carton", categoryId: packaging.id });
    expect(suggestions.map((s) => [s.code, s.reason])).toEqual([
      ["4819", "Default for category Packaging"],
      ["3923", expect.stringContaining("Used for")],
    ]);
  });

  it("find codes by their description and keywords, and never suggest inactive ones", async () => {
    expect((await suggestHsnCodes({ name: "Corrugated carton" })).map((s) => s.code)).toEqual(["4819"]);
    await updateHsnCode(admin, "4819", { isActive: false });
    expect(await suggestHsnCodes({ name: "Corrugated carton" })).toEqual([]);
  });
});

describe("HSN import", () => {
  it("adds new codes and refreshes existing ones in one go", async () => {
    const csv = ["code,description,gst_rate,keywords", "3923,Plastic packing articles,5,bottle", "39011000,Polyethylene (density < 0.94),18,"].join("\n");
    expect(await importHsnCodes(admin, csv)).toEqual({ created: 1, updated: 1 });
    const updated = await prisma.hsnCode.findUniqueOrThrow({ where: { code: "3923" } });
    expect([updated.description, updated.gstRate.toString(), updated.keywords]).toEqual(["Plastic packing articles", "5", "bottle"]);
  });

  it("reports bad lines and imports nothing", async () => {
    const csv = ["code,description,gst_rate", "12,Too short,18", "5601,,18", "5601,Wadding,5"].join("\n");
    const error = await failure(importHsnCodes(admin, csv));
    expect(error?.code).toBe("VALIDATION_ERROR");
    expect((error?.details as { line: number }[]).map((d) => d.line)).toEqual([2, 3]);
    expect(await prisma.hsnCode.count()).toBe(2);
  });

  it("checks product HSN codes in SKU imports and fills a blank rate from the HSN", async () => {
    const csv = ["name,unit,hsn_code,gst_rate", "Jar,PCS,3923,", "Mystery,PCS,1234,"].join("\n");
    const error = await failure(importSkus(admin, csv));
    expect(error?.details).toEqual([{ line: 3, message: "HSN 1234 is not in the HSN master" }]);

    await importSkus(admin, "name,unit,hsn_code,gst_rate\nJar,PCS,3923,");
    expect((await prisma.sku.findFirstOrThrow({ where: { name: "Jar" } })).gstRate?.toString()).toBe("18");
  });
});
