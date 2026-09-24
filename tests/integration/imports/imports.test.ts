import { beforeEach, describe, expect, it } from "vitest";
import type { Actor } from "@/server/actor";
import { prisma } from "@/server/db/client";
import type { AppError } from "@/server/errors";
import { importOpeningStock, importSkus } from "@/server/modules/imports/import.service";
import { findStockDrift } from "../../helpers/database";
import { actorFor, createGodown, createSku, createUom, createUser } from "../../helpers/factories";

let admin: Actor;

beforeEach(async () => {
  admin = actorFor(await createUser("ADMIN"));
  await createUom("KG", 3);
  await createUom("PCS", 0);
  await prisma.category.create({ data: { name: "Raw Materials" } });
});

const failure = (p: Promise<unknown>) => p.then(() => null, (e: AppError) => e);

describe("SKU import", () => {
  it("creates every row of a valid file in one go", async () => {
    const csv = [
      "Code,Name,Unit,Category,GST Rate,Batch Tracked,Tally Stock Item Name",
      'rm-101,"Resin, grade B",kg,raw materials,18,yes,Resin B',
      "PK-201,Carton,PCS,,,no,",
    ].join("\r\n");

    expect(await importSkus(admin, csv)).toEqual({ created: 2 });
    const skus = await prisma.sku.findMany({ orderBy: { code: "asc" }, include: { baseUom: true, category: true } });
    expect(skus.map((s) => [s.code, s.name, s.baseUom.code, s.category?.name ?? null, s.isBatchTracked])).toEqual([
      ["PK-201", "Carton", "PCS", null, false],
      ["RM-101", "Resin, grade B", "KG", "Raw Materials", true],
    ]);
    expect(await prisma.auditLog.count({ where: { action: "MASTER_IMPORTED" } })).toBe(1);
  });

  it("reports every problem with its line number and imports nothing", async () => {
    await createSku({ code: "RM-EXISTS" });
    const csv = [
      "code,name,unit,batch_tracked",
      "RM-1,Good,KG,yes",
      "RM-EXISTS,Duplicate of existing,KG,",
      "RM-2,Bad unit,LTR,",
      "RM-1,Repeated in file,KG,",
      ",Missing code,KG,maybe",
    ].join("\n");

    const error = await failure(importSkus(admin, csv));
    expect(error?.code).toBe("VALIDATION_ERROR");
    expect(error?.message).toBe("4 rows have problems; nothing was imported.");
    expect(error?.details).toEqual([
      { line: 3, message: "SKU RM-EXISTS already exists" },
      { line: 4, message: 'unknown unit "LTR"' },
      { line: 5, message: "SKU RM-1 appears more than once in the file" },
      { line: 6, message: "batch_tracked must be yes or no" },
    ]);
    expect(await prisma.sku.count()).toBe(1);
  });

  it("rejects files with missing or unknown columns", async () => {
    expect((await failure(importSkus(admin, "code,name\nA,B")))?.message).toMatch(/missing required columns: unit/);
    expect((await failure(importSkus(admin, "code,name,unit,colour\nA,B,KG,red")))?.message).toMatch(/Unknown columns: colour/);
  });
});

describe("opening stock import", () => {
  it("posts one opening document per godown and keeps the ledger consistent", async () => {
    const g1 = await createGodown({ code: "MAIN" });
    await createGodown({ code: "RMS" });
    await createSku({ code: "RM-1" });
    await createSku({ code: "PK-1", uomCode: "PCS", isBatchTracked: false });
    const csv = [
      "godown,sku,batch,expiry_date,quantity",
      "main,rm-1,b-1,2027-03-31,250.5",
      "MAIN,PK-1,,,1200",
      "RMS,RM-1,B-2,,10",
    ].join("\n");

    const result = await importOpeningStock(admin, csv, "2026-04-01");

    expect(result.documents.map((d) => [d.godown, d.lines])).toEqual([
      ["MAIN", 2],
      ["RMS", 1],
    ]);
    expect(await prisma.inventoryLedger.count({ where: { movementType: "OPENING" } })).toBe(3);
    const mainStock = await prisma.stockBalance.findMany({ where: { godownId: g1.id }, orderBy: { quantity: "asc" } });
    expect(mainStock.map((b) => b.quantity.toString())).toEqual(["250.5", "1200"]);
    expect(await findStockDrift()).toEqual([]);
  });

  it("validates godowns, SKUs, batches, precision and dates before posting anything", async () => {
    await createGodown({ code: "MAIN" });
    await createSku({ code: "RM-1" });
    await createSku({ code: "PK-1", uomCode: "PCS" });
    const csv = [
      "godown,sku,batch,manufacturing_date,expiry_date,quantity",
      "MAIN,RM-1,B-1,,,5",
      "NOPE,RM-1,B-1,,,5",
      "MAIN,GHOST,B-1,,,5",
      "MAIN,RM-1,,,,5",
      "MAIN,PK-1,B-9,,,1.5",
      "MAIN,RM-1,B-2,2027-01-01,2026-01-01,5",
      "MAIN,RM-1,B-1,,,7",
    ].join("\n");

    const error = await failure(importOpeningStock(admin, csv, "2026-04-01"));
    expect(error?.details).toEqual([
      { line: 3, message: 'unknown godown "NOPE"' },
      { line: 4, message: 'unknown SKU "GHOST"' },
      { line: 5, message: "batch is required for RM-1" },
      { line: 6, message: "quantity: PK-1 allows at most 0 decimal places" },
      { line: 7, message: "expiry_date is before manufacturing_date" },
      { line: 8, message: "the same godown, SKU and batch appear more than once" },
    ]);
    expect(await prisma.inventoryLedger.count()).toBe(0);
  });
});
