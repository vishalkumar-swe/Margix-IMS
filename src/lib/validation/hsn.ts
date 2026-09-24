import { z } from "zod";
import { clearableText, gstRateSchema, idSchema, optionalText, pageQuerySchema, requiredText } from "./common";

/** HSN (goods) or SAC (services) code: 4, 6 or 8 digits. */
export const hsnCodeSchema = z
  .string()
  .trim()
  .regex(/^\d{4}(\d{2}){0,2}$/, "Enter a 4, 6 or 8 digit HSN/SAC code.");

export const hsnCreateSchema = z.object({
  code: hsnCodeSchema,
  description: requiredText(500, "Description"),
  gstRate: gstRateSchema,
  keywords: optionalText(500),
});

export const hsnUpdateSchema = z.object({
  description: requiredText(500, "Description").optional(),
  gstRate: gstRateSchema.optional(),
  keywords: clearableText(500),
  isActive: z.boolean().optional(),
});

export const hsnListQuerySchema = pageQuerySchema.extend({ activeOnly: z.stringbool().default(false) });

/** What is known about a product so far, to recommend its HSN code. */
export const hsnSuggestQuerySchema = z.object({
  name: z.string().trim().max(200).optional(),
  description: z.string().trim().max(1000).optional(),
  categoryId: idSchema.optional(),
});

export type HsnCreateInput = z.infer<typeof hsnCreateSchema>;
export type HsnUpdateInput = z.infer<typeof hsnUpdateSchema>;
export type HsnSuggestQuery = z.infer<typeof hsnSuggestQuerySchema>;
