import type { Invoice, InvoiceStatus } from "@prisma/client";
import { dateOnlyToUtc } from "@/lib/dates";
import type { InvoiceCreateInput } from "@/lib/validation/invoices";
import type { Actor } from "@/server/actor";
import { prisma } from "@/server/db/client";
import { toDecimal, ZERO, type Decimal } from "@/server/db/decimal";
import { lockRowForUpdate } from "@/server/db/locks";
import { withTx, type Tx } from "@/server/db/transaction";
import { BusinessRuleError, ConflictError, NotFoundError, ValidationError } from "@/server/errors";
import { recordAudit } from "@/server/modules/audit/audit.service";
import { nextDocumentNumber, withIdempotency } from "@/server/modules/documents/documents.service";
import { assertUomPrecision } from "@/server/modules/inventory/movement-rules";
import { loadActiveCustomer, loadTransactableSkus } from "@/server/modules/masters/masters.queries";

/**
 * Customer invoices (spec §6.2): what was sold. Dispatches fulfil invoices,
 * possibly in several parts; the invoice tracks dispatched vs remaining per
 * line and moves OPEN → PARTIALLY_DISPATCHED → COMPLETE.
 */

export function createInvoice(actor: Actor, input: InvoiceCreateInput): Promise<Invoice> {
  return withIdempotency(
    input.idempotencyKey,
    (key) => prisma.invoice.findUnique({ where: { idempotencyKey: key } }),
    () =>
      withTx(async (tx) => {
        await loadActiveCustomer(tx, input.customerId);
        const skus = await loadTransactableSkus(
          tx,
          input.items.map((i) => i.skuId),
        );
        for (const item of input.items) {
          const sku = skus.get(item.skuId)!;
          if (sku.status !== "ACTIVE") throw new ValidationError(`SKU ${sku.code} is not active.`, { sku: sku.code });
          assertUomPrecision(toDecimal(item.quantity), sku);
        }

        const invoice = await tx.invoice.create({
          data: {
            invoiceNumber: await nextDocumentNumber(tx, "INV"),
            customerId: input.customerId,
            invoiceDate: dateOnlyToUtc(input.invoiceDate),
            remarks: input.remarks,
            idempotencyKey: input.idempotencyKey,
            createdById: actor.userId,
            items: {
              create: input.items.map((item, index) => ({
                lineNo: index + 1,
                skuId: item.skuId,
                quantity: item.quantity,
                rate: item.rate ?? null,
                gstRate: item.gstRate ?? null,
              })),
            },
          },
          include: { items: true },
        });
        await recordAudit(tx, actor, {
          action: "INVOICE_CREATED",
          entityType: "Invoice",
          entityId: invoice.id,
          newData: invoice,
        });
        return invoice;
      }),
  );
}

/** Cancels an invoice that nothing has been dispatched against. */
export function cancelInvoice(actor: Actor, id: string, reason: string): Promise<Invoice> {
  return withTx(async (tx) => {
    const invoice = await lockInvoice(tx, id);
    if (invoice.status !== "OPEN" || invoice.items.some((i) => i.dispatchedQty.greaterThan(0))) {
      throw new ConflictError(
        "INVALID_STATE",
        `${invoice.invoiceNumber} has dispatches against it and cannot be cancelled.`,
      );
    }
    const cancelled = await tx.invoice.update({
      where: { id },
      data: { status: "CANCELLED", cancelledAt: new Date(), cancelledById: actor.userId, cancelReason: reason },
    });
    await recordAudit(tx, actor, {
      action: "INVOICE_CANCELLED",
      entityType: "Invoice",
      entityId: id,
      newData: { reason },
    });
    return cancelled;
  });
}

export interface InvoiceDispatchLine {
  skuId: string;
  quantity: Decimal;
}

/**
 * Books dispatched quantities against an invoice (called by the dispatch
 * service inside its transaction, after the invoice lock). Returns the
 * invoice item id for each SKU so dispatch lines can be linked to it.
 */
export async function applyDispatchToInvoice(
  tx: Tx,
  invoiceId: string,
  customerId: string | undefined,
  lines: InvoiceDispatchLine[],
): Promise<{ customerId: string; itemIdBySku: Map<string, string> }> {
  const invoice = await lockInvoice(tx, invoiceId);
  if (invoice.status !== "OPEN" && invoice.status !== "PARTIALLY_DISPATCHED") {
    throw new ConflictError(
      "INVALID_STATE",
      `Nothing more can be dispatched against ${invoice.invoiceNumber} (it is ${invoice.status}).`,
    );
  }
  if (customerId && customerId !== invoice.customerId) {
    throw new ValidationError("The dispatch customer must match the invoice customer.");
  }

  const itemBySku = new Map(invoice.items.map((item) => [item.skuId, item]));
  const quantityBySku = new Map<string, Decimal>();
  for (const line of lines) {
    if (!itemBySku.has(line.skuId)) {
      throw new ValidationError("A dispatched SKU is not on the invoice.", { skuId: line.skuId });
    }
    quantityBySku.set(line.skuId, (quantityBySku.get(line.skuId) ?? ZERO).plus(line.quantity));
  }

  for (const [skuId, quantity] of quantityBySku) {
    const item = itemBySku.get(skuId)!;
    const remaining = item.quantity.minus(item.dispatchedQty);
    if (quantity.greaterThan(remaining)) {
      throw new BusinessRuleError("OVER_DISPATCH", "Dispatch quantity exceeds what remains on the invoice.", {
        invoice: invoice.invoiceNumber,
        invoiced: item.quantity.toString(),
        alreadyDispatched: item.dispatchedQty.toString(),
        remaining: remaining.toString(),
        dispatching: quantity.toString(),
      });
    }
    await tx.invoiceItem.update({ where: { id: item.id }, data: { dispatchedQty: { increment: quantity } } });
  }

  await recomputeInvoiceStatus(tx, invoiceId);
  return { customerId: invoice.customerId, itemIdBySku: new Map(invoice.items.map((i) => [i.skuId, i.id])) };
}

/** A reversed dispatch line no longer counts as dispatched on its invoice. */
export async function releaseInvoiceDispatch(tx: Tx, invoiceItemId: string, quantity: Decimal): Promise<void> {
  const item = await tx.invoiceItem.findUniqueOrThrow({ where: { id: invoiceItemId }, select: { invoiceId: true } });
  await lockInvoice(tx, item.invoiceId);
  await tx.invoiceItem.update({ where: { id: invoiceItemId }, data: { dispatchedQty: { decrement: quantity } } });
  await recomputeInvoiceStatus(tx, item.invoiceId);
}

export async function lockInvoice(tx: Tx, id: string) {
  if (!(await lockRowForUpdate(tx, "invoice", id))) throw new NotFoundError("Invoice", id);
  return tx.invoice.findUniqueOrThrow({ where: { id }, include: { items: { orderBy: { lineNo: "asc" } } } });
}

async function recomputeInvoiceStatus(tx: Tx, id: string): Promise<InvoiceStatus> {
  const invoice = await tx.invoice.findUniqueOrThrow({ where: { id }, include: { items: true } });
  if (invoice.status === "CANCELLED") return invoice.status;

  const status: InvoiceStatus = invoice.items.every((i) => i.dispatchedQty.greaterThanOrEqualTo(i.quantity))
    ? "COMPLETE"
    : invoice.items.some((i) => i.dispatchedQty.greaterThan(0))
      ? "PARTIALLY_DISPATCHED"
      : "OPEN";
  if (status !== invoice.status) await tx.invoice.update({ where: { id }, data: { status } });
  return status;
}
