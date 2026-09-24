import type {
  CategoryCreateInput,
  CategoryUpdateInput,
  GodownCreateInput,
  GodownUpdateInput,
  PartyCreateInput,
  PartyUpdateInput,
  SkuCreateInput,
  SkuUpdateInput,
  UomCreateInput,
} from "@/lib/validation/masters";
import type { Actor } from "@/server/actor";
import { withTx } from "@/server/db/transaction";
import { ConflictError, NotFoundError } from "@/server/errors";
import { recordAudit } from "@/server/modules/audit/audit.service";
import { hasStockOnHand } from "@/server/modules/inventory/stock.queries";

/**
 * Master data maintenance. Masters are never deleted (history must stay
 * resolvable); they are deactivated/archived instead. Every change is audited.
 */

// ---- SKU ----

export function createSku(actor: Actor, input: SkuCreateInput) {
  return withTx(async (tx) => {
    const sku = await tx.sku.create({ data: input });
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

    const after = await tx.sku.update({ where: { id }, data: input });
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

// ---- Godown ----

export function createGodown(actor: Actor, input: GodownCreateInput) {
  return withTx(async (tx) => {
    const godown = await tx.godown.create({ data: input });
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

export function createSupplier(actor: Actor, input: PartyCreateInput) {
  return withTx(async (tx) => {
    const supplier = await tx.supplier.create({ data: input });
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
    const after = await tx.supplier.update({ where: { id }, data: input });
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
    const customer = await tx.customer.create({ data: input });
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
    const after = await tx.customer.update({ where: { id }, data: input });
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
