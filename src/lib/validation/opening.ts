import { z } from "zod";
import { dateSchema, idempotencyKeySchema, idSchema, noDuplicateLines, optionalText, quantitySchema } from "./common";

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
