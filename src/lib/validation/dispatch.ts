import { z } from "zod";
import {
  idempotencyKeySchema,
  idSchema,
  noDuplicateLines,
  optionalText,
  pageQuerySchema,
  quantitySchema,
} from "./common";

export const dispatchListQuerySchema = pageQuerySchema.extend({ godownId: idSchema.optional() });

export const dispatchItemSchema = z.object({
  skuId: idSchema,
  batchId: idSchema,
  quantity: quantitySchema,
});

export const dispatchCreateSchema = z
  .object({
    godownId: idSchema,
    customerId: idSchema.optional(),
    /** When set, the dispatch fulfils (part of) this invoice. */
    invoiceId: idSchema.optional(),
    vehicleNo: optionalText(30),
    referenceNo: optionalText(60),
    remarks: optionalText(500),
    idempotencyKey: idempotencyKeySchema,
    items: z.array(dispatchItemSchema).min(1, "Add at least one line.").max(200),
  })
  .superRefine(noDuplicateLines((i) => `${i.skuId}|${i.batchId}`, "batchId"));

export type DispatchCreateInput = z.infer<typeof dispatchCreateSchema>;
