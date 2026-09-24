import { z } from "zod";
import { idSchema, pageQuerySchema } from "./common";

export const stockListQuerySchema = pageQuerySchema.extend({
  godownId: idSchema.optional(),
  skuId: idSchema.optional(),
  includeZero: z.stringbool().default(false),
});

export const availableBatchesQuerySchema = z.object({
  skuId: idSchema,
  godownId: idSchema,
});

export type StockListQuery = z.infer<typeof stockListQuerySchema>;
