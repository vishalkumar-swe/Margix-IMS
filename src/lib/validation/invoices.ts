import { z } from "zod";
import { INVOICE_STATUSES } from "@/lib/enums";
import {
  amountSchema,
  dateSchema,
  gstRateSchema,
  idempotencyKeySchema,
  idSchema,
  noDuplicateLines,
  optionalText,
  pageQuerySchema,
  quantitySchema,
  requiredText,
} from "./common";

export { INVOICE_STATUSES } from "@/lib/enums";

export const invoiceItemSchema = z.object({
  skuId: idSchema,
  /** Quantity in `uomId` (an alternate unit of the SKU) or, when omitted, in its base unit. */
  quantity: quantitySchema,
  uomId: idSchema.optional(),
  rate: amountSchema.optional(),
  gstRate: gstRateSchema.optional(),
});

export const invoiceCreateSchema = z
  .object({
    customerId: idSchema,
    invoiceDate: dateSchema,
    remarks: optionalText(500),
    idempotencyKey: idempotencyKeySchema,
    items: z.array(invoiceItemSchema).min(1, "Add at least one item.").max(200),
  })
  .superRefine(noDuplicateLines((i) => i.skuId, "skuId"));

export const invoiceCancelSchema = z.object({ reason: requiredText(500, "Reason") });

export const invoiceListQuerySchema = pageQuerySchema.extend({
  status: z.enum(INVOICE_STATUSES).optional(),
  customerId: idSchema.optional(),
});

export type InvoiceCreateInput = z.infer<typeof invoiceCreateSchema>;
