import { z } from "zod";
import {
  idempotencyKeySchema,
  idSchema,
  noDuplicateLines,
  optionalText,
  pageQuerySchema,
  quantitySchema,
  requiredText,
} from "./common";

export const salesReturnCreateSchema = z
  .object({
    outwardId: idSchema,
    /** Godown receiving the goods back; defaults to the dispatching godown. */
    godownId: idSchema.optional(),
    reason: requiredText(300, "Reason"),
    remarks: optionalText(500),
    idempotencyKey: idempotencyKeySchema,
    items: z
      .array(z.object({ outwardItemId: idSchema, quantity: quantitySchema }))
      .min(1, "Add at least one line.")
      .max(200),
  })
  .superRefine(noDuplicateLines((i) => i.outwardItemId, "outwardItemId"));

export const purchaseReturnCreateSchema = z
  .object({
    grnId: idSchema,
    /** Godown the goods leave from; defaults to the receiving godown of the GRN. */
    godownId: idSchema.optional(),
    reason: requiredText(300, "Reason"),
    remarks: optionalText(500),
    idempotencyKey: idempotencyKeySchema,
    items: z
      .array(z.object({ grnItemId: idSchema, quantity: quantitySchema }))
      .min(1, "Add at least one line.")
      .max(200),
  })
  .superRefine(noDuplicateLines((i) => i.grnItemId, "grnItemId"));

export const returnListQuerySchema = pageQuerySchema;

export type SalesReturnCreateInput = z.infer<typeof salesReturnCreateSchema>;
export type PurchaseReturnCreateInput = z.infer<typeof purchaseReturnCreateSchema>;
