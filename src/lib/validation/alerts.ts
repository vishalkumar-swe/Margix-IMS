import { z } from "zod";
import { NOTIFICATION_ALERT_TYPES } from "@/lib/enums";
import { idSchema, nonNegativeQuantitySchema, pageQuerySchema } from "./common";

export const reorderRuleSchema = z.object({
  skuId: idSchema,
  godownId: idSchema,
  reorderLevel: nonNegativeQuantitySchema,
  isActive: z.boolean().default(true),
});

export const alertListQuerySchema = pageQuerySchema.extend({
  status: z.enum(["ACTIVE", "RESOLVED"]).default("ACTIVE"),
  type: z.enum(NOTIFICATION_ALERT_TYPES).default("LOW_STOCK"),
  godownId: idSchema.optional(),
});

export type ReorderRuleInput = z.infer<typeof reorderRuleSchema>;
