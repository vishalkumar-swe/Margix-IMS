import { z } from "zod";
import { idSchema, nonNegativeQuantitySchema, pageQuerySchema } from "./common";

export const reorderRuleSchema = z.object({
  skuId: idSchema,
  godownId: idSchema,
  reorderLevel: nonNegativeQuantitySchema,
  isActive: z.boolean().default(true),
});

export const alertListQuerySchema = pageQuerySchema.extend({
  status: z.enum(["ACTIVE", "RESOLVED"]).default("ACTIVE"),
  godownId: idSchema.optional(),
});

export type ReorderRuleInput = z.infer<typeof reorderRuleSchema>;
