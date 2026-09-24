import { z } from "zod";
import { PO_STATUSES } from "@/lib/enums";
import {
  amountSchema,
  compareQuantities,
  dateSchema,
  gstRateSchema,
  idempotencyKeySchema,
  idSchema,
  nonNegativeQuantitySchema,
  optionalText,
  pageQuerySchema,
  quantitySchema,
  requiredText,
} from "./common";

export { PO_STATUSES } from "@/lib/enums";

export const poListQuerySchema = pageQuerySchema.extend({
  status: z.enum(PO_STATUSES).optional(),
  supplierId: idSchema.optional(),
});

export const grnListQuerySchema = pageQuerySchema.extend({
  purchaseOrderId: idSchema.optional(),
});

export const poItemSchema = z.object({
  skuId: idSchema,
  /** Quantity in `uomId` (an alternate unit of the SKU) or, when omitted, in its base unit. */
  orderedQty: quantitySchema,
  uomId: idSchema.optional(),
  rate: amountSchema.optional(),
  gstRate: gstRateSchema.optional(),
});

const poFields = {
  supplierId: idSchema,
  orderDate: dateSchema,
  expectedDate: dateSchema.optional(),
  remarks: optionalText(500),
  items: z.array(poItemSchema).min(1, "Add at least one item.").max(200),
};

type PoShape = { orderDate: string; expectedDate?: string; items: { skuId: string }[] };

function refinePo(value: PoShape, ctx: z.RefinementCtx) {
  const seen = new Set<string>();
  value.items.forEach((item, index) => {
    if (seen.has(item.skuId)) {
      ctx.addIssue({ code: "custom", path: ["items", index, "skuId"], message: "Each SKU may appear only once." });
    }
    seen.add(item.skuId);
  });
  if (value.expectedDate && value.expectedDate < value.orderDate) {
    ctx.addIssue({ code: "custom", path: ["expectedDate"], message: "Expected date cannot be before the order date." });
  }
}

export const poCreateSchema = z
  .object({ ...poFields, submit: z.boolean().default(false), idempotencyKey: idempotencyKeySchema })
  .superRefine(refinePo);

export const poUpdateSchema = z.object(poFields).superRefine(refinePo);

export const poCancelSchema = z.object({ reason: requiredText(500, "Reason") });

export const poShortCloseSchema = z.object({ reason: requiredText(500, "Reason") });

export const grnItemSchema = z
  .object({
    purchaseOrderItemId: idSchema,
    batchNumber: optionalText(60),
    manufacturingDate: dateSchema.optional(),
    expiryDate: dateSchema.optional(),
    receivedQty: quantitySchema,
    acceptedQty: nonNegativeQuantitySchema,
    rejectionReason: optionalText(300),
  })
  .superRefine((item, ctx) => {
    const cmp = compareQuantities(item.acceptedQty, item.receivedQty);
    if (cmp > 0) {
      ctx.addIssue({ code: "custom", path: ["acceptedQty"], message: "Accepted cannot exceed received." });
    }
    if (cmp < 0 && !item.rejectionReason) {
      ctx.addIssue({ code: "custom", path: ["rejectionReason"], message: "Give a reason for the rejected quantity." });
    }
    if (item.manufacturingDate && item.expiryDate && item.expiryDate < item.manufacturingDate) {
      ctx.addIssue({ code: "custom", path: ["expiryDate"], message: "Expiry cannot be before manufacturing." });
    }
  });

export const grnCreateSchema = z
  .object({
    godownId: idSchema,
    supplierInvoiceNo: optionalText(60),
    remarks: optionalText(500),
    idempotencyKey: idempotencyKeySchema,
    items: z.array(grnItemSchema).min(1, "Add at least one line.").max(200),
  })
  .superRefine((value, ctx) => {
    const seen = new Set<string>();
    value.items.forEach((item, index) => {
      const key = `${item.purchaseOrderItemId}|${(item.batchNumber ?? "").toUpperCase()}`;
      if (seen.has(key)) {
        ctx.addIssue({
          code: "custom",
          path: ["items", index, "batchNumber"],
          message: "The same item and batch appear twice.",
        });
      }
      seen.add(key);
    });
  });

export type PoCreateInput = z.infer<typeof poCreateSchema>;
export type PoUpdateInput = z.infer<typeof poUpdateSchema>;
export type GrnCreateInput = z.infer<typeof grnCreateSchema>;
