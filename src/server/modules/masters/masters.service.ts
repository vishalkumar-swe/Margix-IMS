import { internalEan13, MAX_INTERNAL_SEQUENCE } from "@/lib/barcode";
import { stateCodeOfGstin } from "@/lib/gst-states";
import type {
  CategoryCreateInput,
  CategoryUpdateInput,
  GodownCreateInput,
  GodownUpdateInput,
  PartyCreateInput,
  PartyUpdateInput,
  SkuCreateInput,
  SkuUnitInput,
  SkuUpdateInput,
  UomCreateInput,
} from "@/lib/validation/masters";
import type { Actor } from "@/server/actor";
import { withTx, type Tx } from "@/server/db/transaction";
import { ConflictError, NotFoundError, ValidationError } from "@/server/errors";
import { recordAudit } from "@/server/modules/audit/audit.service";
import { requireActiveHsn } from "@/server/modules/hsn/hsn.service";
import { allocateCode } from "@/server/modules/numbering/numbering.service";
import { hasStockOnHand } from "@/server/modules/inventory/stock.queries";

/**
 * Master data maintenance. Masters are never deleted (history must stay
 * resolvable); they are deactivated/archived instead. Every change is audited.
 */

// ---- SKU ----

export function createSku(actor: Actor, input: SkuCreateInput) {
  return withTx(async (tx) => {
    // The GST rate follows the HSN master unless one is given deliberately.
    const hsn = input.hsnCode ? await requireActiveHsn(tx, input.hsnCode) : null;
    // Every product gets a barcode: the one given, or a generated internal EAN-13.
    if (input.barcode) await assertBarcodeFree(tx, input.barcode);
    const sku = await tx.sku.create({
      data: {
        ...input,
        gstRate: input.gstRate ?? hsn?.gstRate,
        code: input.code ?? (await allocateCode(tx, "SKU")),
        barcode: input.barcode ?? (await allocateBarcode(tx)),
      },
    });
    await recordAudit(tx, actor, { action: "MASTER_CREATED", entityType: "Sku", entityId: sku.id, newData: sku });
    return sku;
  });
}

export function updateSku(actor: Actor, id: string, input: SkuUpdateInput) {
  return withTx(async (tx) => {
    const before = await tx.sku.findUnique({ where: { id } });
    if (!before) throw new NotFoundError("SKU", id);

    const changesStockIdentity =
      (input.isBatchTracked !== undefined && input.isBatchTracked !== before.isBatchTracked) ||
      (input.baseUomId !== undefined && input.baseUomId !== before.baseUomId);
    if (changesStockIdentity && (await tx.inventoryLedger.findFirst({ where: { skuId: id }, select: { id: true } }))) {
      throw new ConflictError(
        "INVALID_STATE",
        "Batch tracking and unit cannot change once the SKU has stock movements.",
      );
    }
    if (input.status === "ARCHIVED" && before.status !== "ARCHIVED" && (await hasStockOnHand({ skuId: id }, tx))) {
      throw new ConflictError("INVALID_STATE", `SKU ${before.code} still has stock on hand and cannot be archived.`);
    }

    if (input.barcode && input.barcode !== before.barcode) await assertBarcodeFree(tx, input.barcode, id);

    // A new HSN brings its GST rate, unless a rate is set in the same change.
    const data = { ...input };
    if (input.hsnCode && input.hsnCode !== before.hsnCode) {
      const hsn = await requireActiveHsn(tx, input.hsnCode);
      if (input.gstRate === undefined) data.gstRate = hsn.gstRate.toString();
    }

    const after = await tx.sku.update({ where: { id }, data });
    await recordAudit(tx, actor, {
      action: "MASTER_UPDATED",
      entityType: "Sku",
      entityId: id,
      oldData: before,
      newData: after,
    });
    return after;
  });
}

/**
 * Gives a SKU a generated internal EAN-13. A SKU that already has a barcode
 * keeps it unless `replace` is set (labels already printed would stop scanning).
 */
export function generateSkuBarcode(actor: Actor, id: string, options: { replace: boolean }) {
  return withTx(async (tx) => {
    const before = await tx.sku.findUnique({ where: { id }, select: { id: true, code: true, barcode: true } });
    if (!before) throw new NotFoundError("SKU", id);
    if (before.barcode && !options.replace) {
      throw new ConflictError("INVALID_STATE", `SKU ${before.code} already has barcode ${before.barcode}.`);
    }
    const after = await tx.sku.update({ where: { id }, data: { barcode: await allocateBarcode(tx) } });
    await recordAudit(tx, actor, {
      action: "MASTER_UPDATED",
      entityType: "Sku",
      entityId: id,
      oldData: { barcode: before.barcode },
      newData: { barcode: after.barcode },
    });
    return after;
  });
}

/** Generates internal EAN-13s for every SKU (not archived) that has no barcode yet. */
export function generateMissingSkuBarcodes(actor: Actor) {
  return withTx(async (tx) => {
    const skus = await tx.sku.findMany({
      where: { barcode: null, status: { not: "ARCHIVED" } },
      orderBy: { code: "asc" },
      select: { id: true, code: true },
    });
    const assigned: { code: string; barcode: string }[] = [];
    for (const sku of skus) {
      const barcode = await allocateBarcode(tx);
      await tx.sku.update({ where: { id: sku.id }, data: { barcode } });
      assigned.push({ code: sku.code, barcode });
    }
    if (assigned.length > 0) {
      await recordAudit(tx, actor, { action: "MASTER_UPDATED", entityType: "Sku", newData: { barcodesGenerated: assigned } });
    }
    return { count: assigned.length };
  });
}

/**
 * Allocates the next free internal EAN-13 (prefix 2 + counter + check digit).
 * The counter row stays locked until the transaction ends, and values already
 * taken (typed by hand) are skipped, so the result is unique.
 */
export async function allocateBarcode(tx: Tx): Promise<string> {
  for (;;) {
    const rows = await tx.$queryRaw<{ last_value: number }[]>`
      INSERT INTO "document_sequence" ("key", "last_value")
      VALUES ('BARCODE:EAN13', 1)
      ON CONFLICT ("key") DO UPDATE SET "last_value" = "document_sequence"."last_value" + 1
      RETURNING "last_value"`;
    const sequence = Number(rows[0].last_value);
    if (sequence > MAX_INTERNAL_SEQUENCE) throw new ConflictError("INVALID_STATE", "Internal barcodes are exhausted.");
    const barcode = internalEan13(sequence);
    if (!(await tx.sku.findUnique({ where: { barcode }, select: { id: true } }))) return barcode;
  }
}

/** A barcode may belong to one SKU only (reported against the form field). */
async function assertBarcodeFree(tx: Tx, barcode: string, exceptSkuId?: string) {
  const owner = await tx.sku.findUnique({ where: { barcode }, select: { id: true, code: true } });
  if (owner && owner.id !== exceptSkuId) {
    throw new ValidationError(`Barcode ${barcode} is already used by ${owner.code}.`, [
      { path: "barcode", message: `Already used by ${owner.code}.` },
    ]);
  }
}

/**
 * Adds or re-factors an alternate unit of a SKU. Documents keep their own
 * snapshot of the factor, so changing it never alters past quantities.
 */
export function setSkuUnit(actor: Actor, skuId: string, input: SkuUnitInput) {
  return withTx(async (tx) => {
    const sku = await tx.sku.findUnique({ where: { id: skuId }, select: { id: true, code: true, baseUomId: true } });
    if (!sku) throw new NotFoundError("SKU", skuId);
    if (input.uomId === sku.baseUomId) {
      throw new ValidationError(`That is already the base unit of ${sku.code}.`, { uomId: input.uomId });
    }
    if (!(await tx.uom.findUnique({ where: { id: input.uomId }, select: { id: true } }))) {
      throw new NotFoundError("Unit", input.uomId);
    }

    const before = await tx.skuUnit.findUnique({ where: { skuId_uomId: { skuId, uomId: input.uomId } } });
    const after = await tx.skuUnit.upsert({
      where: { skuId_uomId: { skuId, uomId: input.uomId } },
      create: { skuId, uomId: input.uomId, factor: input.factor },
      update: { factor: input.factor },
    });
    await recordAudit(tx, actor, {
      action: "MASTER_UPDATED",
      entityType: "Sku",
      entityId: skuId,
      oldData: before ? { unit: before } : undefined,
      newData: { unit: after },
    });
    return after;
  });
}

/** Removes an alternate unit; documents entered in it keep their snapshot. */
export function removeSkuUnit(actor: Actor, skuId: string, uomId: string) {
  return withTx(async (tx) => {
    const before = await tx.skuUnit.findUnique({ where: { skuId_uomId: { skuId, uomId } } });
    if (!before) throw new NotFoundError("SKU unit", uomId);
    await tx.skuUnit.delete({ where: { id: before.id } });
    await recordAudit(tx, actor, {
      action: "MASTER_UPDATED",
      entityType: "Sku",
      entityId: skuId,
      oldData: { unit: before },
    });
  });
}

// ---- Godown ----

export function createGodown(actor: Actor, input: GodownCreateInput) {
  return withTx(async (tx) => {
    const godown = await tx.godown.create({ data: { ...input, code: input.code ?? (await allocateCode(tx, "GODOWN")) } });
    await recordAudit(tx, actor, {
      action: "MASTER_CREATED",
      entityType: "Godown",
      entityId: godown.id,
      newData: godown,
    });
    return godown;
  });
}

export function updateGodown(actor: Actor, id: string, input: GodownUpdateInput) {
  return withTx(async (tx) => {
    const before = await tx.godown.findUnique({ where: { id } });
    if (!before) throw new NotFoundError("Godown", id);
    if (input.isActive === false && before.isActive && (await hasStockOnHand({ godownId: id }, tx))) {
      throw new ConflictError("INVALID_STATE", `Godown ${before.code} still holds stock and cannot be deactivated.`);
    }

    const after = await tx.godown.update({ where: { id }, data: input });
    await recordAudit(tx, actor, {
      action: "MASTER_UPDATED",
      entityType: "Godown",
      entityId: id,
      oldData: before,
      newData: after,
    });
    return after;
  });
}

// ---- Suppliers & customers ----

/**
 * A GSTIN carries its state, so a party with a GSTIN always gets that state
 * (a different state typed alongside it would be contradictory).
 */
function withGstinState<T extends { gstin?: string | null; stateCode?: string | null }>(
  input: T,
  before?: { gstin: string | null; stateCode: string | null },
): T {
  const gstin = input.gstin !== undefined ? input.gstin : before?.gstin;
  const fromGstin = stateCodeOfGstin(gstin);
  return fromGstin ? { ...input, stateCode: fromGstin } : input;
}

export function createSupplier(actor: Actor, input: PartyCreateInput) {
  return withTx(async (tx) => {
    const supplier = await tx.supplier.create({
      data: { ...withGstinState(input), code: input.code ?? (await allocateCode(tx, "SUPPLIER")) },
    });
    await recordAudit(tx, actor, {
      action: "MASTER_CREATED",
      entityType: "Supplier",
      entityId: supplier.id,
      newData: supplier,
    });
    return supplier;
  });
}

export function updateSupplier(actor: Actor, id: string, input: PartyUpdateInput) {
  return withTx(async (tx) => {
    const before = await tx.supplier.findUnique({ where: { id } });
    if (!before) throw new NotFoundError("Supplier", id);
    const after = await tx.supplier.update({ where: { id }, data: withGstinState(input, before) });
    await recordAudit(tx, actor, {
      action: "MASTER_UPDATED",
      entityType: "Supplier",
      entityId: id,
      oldData: before,
      newData: after,
    });
    return after;
  });
}

export function createCustomer(actor: Actor, input: PartyCreateInput) {
  return withTx(async (tx) => {
    const customer = await tx.customer.create({
      data: { ...withGstinState(input), code: input.code ?? (await allocateCode(tx, "CUSTOMER")) },
    });
    await recordAudit(tx, actor, {
      action: "MASTER_CREATED",
      entityType: "Customer",
      entityId: customer.id,
      newData: customer,
    });
    return customer;
  });
}

export function updateCustomer(actor: Actor, id: string, input: PartyUpdateInput) {
  return withTx(async (tx) => {
    const before = await tx.customer.findUnique({ where: { id } });
    if (!before) throw new NotFoundError("Customer", id);
    const after = await tx.customer.update({ where: { id }, data: withGstinState(input, before) });
    await recordAudit(tx, actor, {
      action: "MASTER_UPDATED",
      entityType: "Customer",
      entityId: id,
      oldData: before,
      newData: after,
    });
    return after;
  });
}

// ---- Categories & units ----

export function createCategory(actor: Actor, input: CategoryCreateInput) {
  return withTx(async (tx) => {
    if (input.hsnCode) await requireActiveHsn(tx, input.hsnCode);
    const category = await tx.category.create({ data: input });
    await recordAudit(tx, actor, {
      action: "MASTER_CREATED",
      entityType: "Category",
      entityId: category.id,
      newData: category,
    });
    return category;
  });
}

export function updateCategory(actor: Actor, id: string, input: CategoryUpdateInput) {
  return withTx(async (tx) => {
    const before = await tx.category.findUnique({ where: { id } });
    if (!before) throw new NotFoundError("Category", id);
    if (input.hsnCode) await requireActiveHsn(tx, input.hsnCode);
    const after = await tx.category.update({ where: { id }, data: input });
    await recordAudit(tx, actor, {
      action: "MASTER_UPDATED",
      entityType: "Category",
      entityId: id,
      oldData: before,
      newData: after,
    });
    return after;
  });
}

export function createUom(actor: Actor, input: UomCreateInput) {
  return withTx(async (tx) => {
    const uom = await tx.uom.create({ data: input });
    await recordAudit(tx, actor, { action: "MASTER_CREATED", entityType: "Uom", entityId: uom.id, newData: uom });
    return uom;
  });
}
