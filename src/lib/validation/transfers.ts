import { z } from "zod";
import {
  idempotencyKeySchema,
  idSchema,
  noDuplicateLines,
  optionalText,
  pageQuerySchema,
  quantitySchema,
} from "./common";

export const transferItemSchema = z.object({
  skuId: idSchema,
  batchId: idSchema,
  quantity: quantitySchema,
});

export const transferCreateSchema = z
  .object({
    fromGodownId: idSchema,
    toGodownId: idSchema,
    remarks: optionalText(500),
    idempotencyKey: idempotencyKeySchema,
    items: z.array(transferItemSchema).min(1, "Add at least one line.").max(200),
  })
  .superRefine((value, ctx) => {
    if (value.fromGodownId === value.toGodownId) {
      ctx.addIssue({ code: "custom", path: ["toGodownId"], message: "Choose a different destination godown." });
    }
  })
  .superRefine(noDuplicateLines((i) => `${i.skuId}|${i.batchId}`, "batchId"));

export const transferListQuerySchema = pageQuerySchema.extend({ godownId: idSchema.optional() });

export type TransferCreateInput = z.infer<typeof transferCreateSchema>;
