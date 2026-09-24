import { parseCsvRecords, type CsvRecord } from "@/lib/csv";
import { dateSchema, quantitySchema } from "@/lib/validation/common";
import {
  HSN_IMPORT_COLUMNS,
  MAX_HSN_IMPORT_ROWS,
  MAX_IMPORT_ROWS,
  OPENING_IMPORT_COLUMNS,
  SKU_IMPORT_COLUMNS,
  type ImportRowError,
} from "@/lib/validation/imports";
import { hsnCreateSchema, type HsnCreateInput } from "@/lib/validation/hsn";
import { skuCreateSchema, type SkuCreateInput } from "@/lib/validation/masters";
import type { OpeningCreateInput } from "@/lib/validation/opening";
import type { Actor } from "@/server/actor";
import { prisma } from "@/server/db/client";
import { toDecimal } from "@/server/db/decimal";
import { withTx } from "@/server/db/transaction";
import { ValidationError } from "@/server/errors";
import { recordAudit } from "@/server/modules/audit/audit.service";
import { postOpeningBalanceInTx } from "@/server/modules/opening/opening.service";
import { allocateCode } from "@/server/modules/numbering/numbering.service";

/**
 * Bulk CSV imports. Every row is validated first and all problems are
 * reported together with their line numbers; only a fully valid file is
 * written, in a single transaction (nothing is imported otherwise).
 */

const IMPORT_TIMEOUT_MS = 120_000;

// ---- SKUs ----

export async function importSkus(actor: Actor, csv: string): Promise<{ created: number }> {
  const records = readRecords(csv, SKU_IMPORT_COLUMNS);
  const [uoms, categories, existing, hsnCodes] = await Promise.all([
    prisma.uom.findMany({ select: { id: true, code: true } }),
    prisma.category.findMany({ where: { isActive: true }, select: { id: true, name: true } }),
    prisma.sku.findMany({
      where: { code: { in: records.flatMap((r) => (r.values.code ? [r.values.code.toUpperCase()] : [])) } },
      select: { code: true },
    }),
    prisma.hsnCode.findMany({
      where: { code: { in: records.flatMap((r) => (r.values.hsn_code ? [r.values.hsn_code.trim()] : [])) } },
      select: { code: true, gstRate: true, isActive: true },
    }),
  ]);
  const hsnByCode = new Map(hsnCodes.map((h) => [h.code, h]));
  const uomByCode = new Map(uoms.map((u) => [u.code.toUpperCase(), u.id]));
  const categoryByName = new Map(categories.map((c) => [c.name.toLowerCase(), c.id]));
  const existingCodes = new Set(existing.map((s) => s.code));

  const errors: ImportRowError[] = [];
  const seen = new Set<string>();
  const rows: SkuCreateInput[] = [];

  for (const { line, values } of records) {
    const problems: string[] = [];
    const baseUomId = uomByCode.get(values.unit.toUpperCase());
    if (values.unit && !baseUomId) problems.push(`unknown unit "${values.unit}"`);
    const categoryId = values.category ? categoryByName.get(values.category.toLowerCase()) : undefined;
    if (values.category && !categoryId) problems.push(`unknown category "${values.category}"`);
    const isBatchTracked = parseYesNo(values.batch_tracked ?? "");
    if (isBatchTracked === null) problems.push(`batch_tracked must be yes or no`);

    const parsed = skuCreateSchema.safeParse({
      code: values.code,
      name: values.name,
      description: values.description,
      categoryId,
      baseUomId: baseUomId ?? "",
      hsnCode: values.hsn_code,
      // A blank rate takes the HSN master's rate.
      gstRate: values.gst_rate || hsnByCode.get(values.hsn_code?.trim() ?? "")?.gstRate.toString() || undefined,
      isBatchTracked: isBatchTracked ?? true,
      tallyStockItemName: values.tally_stock_item_name,
    });
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        if (issue.path[0] === "baseUomId" && values.unit) continue; // reported as unknown unit
        problems.push(`${columnFor(String(issue.path[0]))}: ${issue.message}`);
      }
    } else {
      const { code, hsnCode } = parsed.data;
      const hsn = hsnCode ? hsnByCode.get(hsnCode) : undefined;
      if (hsnCode && !hsn) problems.push(`HSN ${hsnCode} is not in the HSN master`);
      else if (hsn && !hsn.isActive) problems.push(`HSN ${hsnCode} is inactive`);
      if (code && existingCodes.has(code)) problems.push(`SKU ${code} already exists`);
      if (code && seen.has(code)) problems.push(`SKU ${code} appears more than once in the file`);
      if (code) seen.add(code);
      if (problems.length === 0) rows.push(parsed.data);
    }
    if (problems.length > 0) errors.push({ line, message: problems.join("; ") });
  }

  throwIfErrors(errors);
  await withTx(
    async (tx) => {
      // Rows with their own code first, so allocated codes can never collide with them.
      const withCode = rows.filter((r): r is SkuCreateInput & { code: string } => Boolean(r.code));
      await tx.sku.createMany({ data: withCode });
      const allocated: string[] = [];
      for (const row of rows.filter((r) => !r.code)) {
        const code = await allocateCode(tx, "SKU");
        await tx.sku.create({ data: { ...row, code } });
        allocated.push(code);
      }
      await recordAudit(tx, actor, {
        action: "MASTER_IMPORTED",
        entityType: "Sku",
        newData: { count: rows.length, codes: [...withCode.map((r) => r.code), ...allocated] },
      });
    },
    { timeoutMs: IMPORT_TIMEOUT_MS },
  );
  return { created: rows.length };
}

// ---- Opening stock ----

export async function importOpeningStock(
  actor: Actor,
  csv: string,
  asOf: string,
): Promise<{ documents: { openingNumber: string; godown: string; lines: number }[] }> {
  const records = readRecords(csv, OPENING_IMPORT_COLUMNS);
  const [godowns, skus] = await Promise.all([
    prisma.godown.findMany({ select: { id: true, code: true, isActive: true } }),
    prisma.sku.findMany({
      where: { code: { in: records.map((r) => r.values.sku.toUpperCase()) } },
      select: { id: true, code: true, status: true, isBatchTracked: true, baseUom: { select: { decimalPlaces: true } } },
    }),
  ]);
  const godownByCode = new Map(godowns.map((g) => [g.code.toUpperCase(), g]));
  const skuByCode = new Map(skus.map((s) => [s.code, s]));

  const errors: ImportRowError[] = [];
  const seen = new Set<string>();
  const byGodown = new Map<string, { code: string; items: OpeningCreateInput["items"] }>();

  for (const { line, values } of records) {
    const problems: string[] = [];
    const godown = godownByCode.get(values.godown.toUpperCase());
    if (!godown) problems.push(`unknown godown "${values.godown}"`);
    else if (!godown.isActive) problems.push(`godown ${godown.code} is inactive`);

    const sku = skuByCode.get(values.sku.toUpperCase());
    if (!sku) problems.push(`unknown SKU "${values.sku}"`);
    else if (sku.status === "ARCHIVED") problems.push(`SKU ${sku.code} is archived`);

    const quantity = quantitySchema.safeParse(values.quantity);
    if (!quantity.success) problems.push(`quantity: ${quantity.error.issues[0].message}`);
    else if (sku && toDecimal(quantity.data).decimalPlaces() > sku.baseUom.decimalPlaces) {
      problems.push(`quantity: ${sku.code} allows at most ${sku.baseUom.decimalPlaces} decimal places`);
    }

    const batchNumber = values.batch || undefined;
    if (sku?.isBatchTracked && !batchNumber) problems.push(`batch is required for ${sku.code}`);
    const manufacturingDate = optionalDate(values.manufacturing_date, "manufacturing_date", problems);
    const expiryDate = optionalDate(values.expiry_date, "expiry_date", problems);
    if (manufacturingDate && expiryDate && expiryDate < manufacturingDate) {
      problems.push("expiry_date is before manufacturing_date");
    }

    if (problems.length === 0 && godown && sku && quantity.success) {
      const key = `${godown.id}|${sku.id}|${(sku.isBatchTracked ? (batchNumber ?? "") : "").toUpperCase()}`;
      if (seen.has(key)) {
        problems.push("the same godown, SKU and batch appear more than once");
      } else {
        seen.add(key);
        const group = byGodown.get(godown.id) ?? { code: godown.code, items: [] };
        group.items.push({ skuId: sku.id, batchNumber, manufacturingDate, expiryDate, quantity: quantity.data });
        byGodown.set(godown.id, group);
      }
    }
    if (problems.length > 0) errors.push({ line, message: problems.join("; ") });
  }

  throwIfErrors(errors);
  const documents = await withTx(
    async (tx) => {
      const posted = [];
      for (const [godownId, group] of byGodown) {
        const opening = await postOpeningBalanceInTx(tx, actor, {
          godownId,
          asOf,
          remarks: "Imported from CSV",
          items: group.items,
        });
        posted.push({ openingNumber: opening.openingNumber, godown: group.code, lines: group.items.length });
      }
      return posted;
    },
    { timeoutMs: IMPORT_TIMEOUT_MS },
  );
  return { documents };
}

// ---- helpers ----

// ---- HSN / SAC master ----

/**
 * Loads or refreshes the HSN/SAC master (e.g. from the official CBIC list):
 * new codes are added, existing ones get the file's description, rate and
 * keywords. Products keep their own applied rate; documents already posted
 * are never affected.
 */
export async function importHsnCodes(actor: Actor, csv: string): Promise<{ created: number; updated: number }> {
  const records = readRecords(csv, HSN_IMPORT_COLUMNS, MAX_HSN_IMPORT_ROWS);
  const errors: ImportRowError[] = [];
  const rows = new Map<string, HsnCreateInput>();

  for (const { line, values } of records) {
    const parsed = hsnCreateSchema.safeParse({
      code: values.code,
      description: values.description,
      gstRate: values.gst_rate,
      keywords: values.keywords,
    });
    if (!parsed.success) {
      errors.push({ line, message: parsed.error.issues.map((i) => `${columnFor(String(i.path[0]))}: ${i.message}`).join("; ") });
    } else if (rows.has(parsed.data.code)) {
      errors.push({ line, message: `HSN ${parsed.data.code} appears more than once in the file` });
    } else {
      rows.set(parsed.data.code, parsed.data);
    }
  }
  throwIfErrors(errors);

  const existing = new Set(
    (await prisma.hsnCode.findMany({ where: { code: { in: [...rows.keys()] } }, select: { code: true } })).map((h) => h.code),
  );
  const toCreate = [...rows.values()].filter((r) => !existing.has(r.code));
  const toUpdate = [...rows.values()].filter((r) => existing.has(r.code));

  await withTx(
    async (tx) => {
      await tx.hsnCode.createMany({ data: toCreate });
      for (const row of toUpdate) {
        await tx.hsnCode.update({
          where: { code: row.code },
          data: { description: row.description, gstRate: row.gstRate, keywords: row.keywords ?? null, isActive: true },
        });
      }
      await recordAudit(tx, actor, {
        action: "MASTER_IMPORTED",
        entityType: "HsnCode",
        newData: { created: toCreate.length, updated: toUpdate.length },
      });
    },
    { timeoutMs: IMPORT_TIMEOUT_MS },
  );
  return { created: toCreate.length, updated: toUpdate.length };
}

function readRecords(
  csv: string,
  columns: { required: readonly string[]; optional: readonly string[] },
  maxRows: number = MAX_IMPORT_ROWS,
): CsvRecord[] {
  const { headers, records } = parseCsvRecords(csv);
  const missing = columns.required.filter((c) => !headers.includes(c));
  if (missing.length > 0) {
    throw new ValidationError(`The file is missing required columns: ${missing.join(", ")}.`, [
      { line: 1, message: `Expected columns: ${[...columns.required, ...columns.optional].join(", ")}` },
    ]);
  }
  const unknown = headers.filter((h) => !columns.required.includes(h) && !columns.optional.includes(h));
  if (unknown.length > 0) {
    throw new ValidationError(`Unknown columns: ${unknown.join(", ")}.`, [
      { line: 1, message: `Allowed columns: ${[...columns.required, ...columns.optional].join(", ")}` },
    ]);
  }
  if (records.length === 0) throw new ValidationError("The file has no data rows.");
  if (records.length > maxRows) {
    throw new ValidationError(`At most ${maxRows} rows can be imported at once; split the file.`);
  }
  return records;
}

function throwIfErrors(errors: ImportRowError[]): void {
  if (errors.length > 0) {
    throw new ValidationError(
      `${errors.length} row${errors.length === 1 ? " has" : "s have"} problems; nothing was imported.`,
      errors,
    );
  }
}

function parseYesNo(value: string): boolean | null {
  const normalised = value.trim().toLowerCase();
  if (["", "yes", "y", "true", "1"].includes(normalised)) return true;
  if (["no", "n", "false", "0"].includes(normalised)) return false;
  return null;
}

function optionalDate(value: string | undefined, column: string, problems: string[]): string | undefined {
  if (!value) return undefined;
  const parsed = dateSchema.safeParse(value);
  if (!parsed.success) {
    problems.push(`${column}: use YYYY-MM-DD`);
    return undefined;
  }
  return parsed.data;
}

/** Maps schema field names back to CSV column names for error messages. */
function columnFor(field: string): string {
  const map: Record<string, string> = {
    code: "code",
    name: "name",
    baseUomId: "unit",
    categoryId: "category",
    hsnCode: "hsn_code",
    gstRate: "gst_rate",
    isBatchTracked: "batch_tracked",
    tallyStockItemName: "tally_stock_item_name",
    description: "description",
  };
  return map[field] ?? field;
}
