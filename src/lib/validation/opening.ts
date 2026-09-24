import { z } from "zod";
import {
  dateSchema,
  idempotencyKeySchema,
  idSchema,
  noDuplicateLines,
  optionalText,
  pageQuerySchema,
  quantitySchema,
  requiredText,
} from "./common";

export const openingItemSchema = z.object({
  skuId: idSchema,
  batchNumber: optionalText(60),
  manufacturingDate: dateSchema.optional(),
  expiryDate: dateSchema.optional(),
  quantity: quantitySchema,
});

export const openingCreateSchema = z
  .object({
    godownId: idSchema,
    asOf: dateSchema,
    remarks: optionalText(500),
    idempotencyKey: idempotencyKeySchema,
    items: z.array(openingItemSchema).min(1, "Add at least one line.").max(500),
  })
  .superRefine(noDuplicateLines((i) => `${i.skuId}|${(i.batchNumber ?? "").toUpperCase()}`, "batchNumber"));

export type OpeningCreateInput = z.infer<typeof openingCreateSchema>;

/** Correcting one posted opening line: the corrected values plus why. */
export const openingLineCorrectionSchema = z.object({
  quantity: quantitySchema,
  batchNumber: optionalText(60),
  manufacturingDate: dateSchema.optional(),
  expiryDate: dateSchema.optional(),
  reason: requiredText(500, "Reason"),
});

/** Removing (reversing) one posted opening line. */
export const openingLineVoidSchema = z.object({ reason: requiredText(500, "Reason") });

export const OPENING_LINE_STATES = ["active", "reversed"] as const;

export const openingLineListQuerySchema = pageQuerySchema.extend({
  godownId: idSchema.optional(),
  state: z.enum(OPENING_LINE_STATES).optional(),
});

export type OpeningLineCorrectionInput = z.infer<typeof openingLineCorrectionSchema>;
export type OpeningLineListQuery = z.infer<typeof openingLineListQuerySchema>;
