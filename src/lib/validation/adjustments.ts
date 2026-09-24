import { z } from "zod";
import { ADJUSTMENT_REASONS, ADJUSTMENT_STATUSES } from "@/lib/enums";
import {
  idempotencyKeySchema,
  idSchema,
  noDuplicateLines,
  optionalText,
  pageQuerySchema,
  requiredText,
  signedQuantitySchema,
} from "./common";

export { ADJUSTMENT_STATUSES, ADJUSTMENT_REASONS, ADJUSTMENT_REASON_LABELS, type AdjustmentReasonCode } from "@/lib/enums";

export const adjustmentListQuerySchema = pageQuerySchema.extend({
  status: z.enum(ADJUSTMENT_STATUSES).optional(),
});

/**
 * A line either references an existing batch (required when reducing stock)
 * or, for increases only, names a batch number that may not exist yet.
 */
export const adjustmentItemSchema = z
  .object({
    skuId: idSchema,
    batchId: idSchema.optional(),
    batchNumber: optionalText(60),
    quantity: signedQuantitySchema,
  })
  .superRefine((item, ctx) => {
    if (!item.batchId && item.quantity.startsWith("-")) {
      ctx.addIssue({ code: "custom", path: ["batchId"], message: "Select the batch to reduce." });
    }
    if (item.batchId && item.batchNumber) {
      ctx.addIssue({
        code: "custom",
        path: ["batchNumber"],
        message: "Choose an existing batch or a new one, not both.",
      });
    }
  });

export const adjustmentCreateSchema = z
  .object({
    godownId: idSchema,
    reasonCode: z.enum(ADJUSTMENT_REASONS),
    reasonNote: optionalText(500),
    idempotencyKey: idempotencyKeySchema,
    items: z.array(adjustmentItemSchema).min(1, "Add at least one line.").max(200),
  })
  .superRefine((value, ctx) => {
    if (value.reasonCode === "OTHER" && !value.reasonNote) {
      ctx.addIssue({ code: "custom", path: ["reasonNote"], message: "Describe the reason." });
    }
  })
  .superRefine(
    noDuplicateLines((i) => `${i.skuId}|${i.batchId ?? (i.batchNumber ?? "").toUpperCase()}`, "batchId"),
  );

export const adjustmentApproveSchema = z.object({ note: optionalText(500) });
export const adjustmentRejectSchema = z.object({ note: requiredText(500, "Reason for rejection") });

export type AdjustmentCreateInput = z.infer<typeof adjustmentCreateSchema>;
