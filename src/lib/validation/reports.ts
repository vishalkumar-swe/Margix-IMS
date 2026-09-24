import { z } from "zod";
import { dateSchema, idSchema } from "./common";
import { MOVEMENT_TYPES } from "./ledger";

const formatSchema = z.enum(["json", "csv"]).default("json");

/** Date range in IST calendar days (inclusive). Defaults are applied by the report. */
const rangeSchema = {
  from: dateSchema.optional(),
  to: dateSchema.optional(),
};

function refineRange(value: { from?: string; to?: string }, ctx: z.RefinementCtx) {
  if (value.from && value.to && value.to < value.from) {
    ctx.addIssue({ code: "custom", path: ["to"], message: "End date cannot be before start date." });
  }
}

export const stockSummaryQuerySchema = z
  .object({
    ...rangeSchema,
    godownId: idSchema.optional(),
    skuId: idSchema.optional(),
    groupBy: z.enum(["sku", "batch"]).default("sku"),
    format: formatSchema,
  })
  .superRefine(refineRange);

export const movementReportQuerySchema = z
  .object({
    ...rangeSchema,
    godownId: idSchema.optional(),
    skuId: idSchema.optional(),
    movementType: z.enum(MOVEMENT_TYPES).optional(),
    format: formatSchema,
  })
  .superRefine(refineRange);

export const stockAgingQuerySchema = z.object({
  kind: z.enum(["slow", "dead"]).default("slow"),
  godownId: idSchema.optional(),
  format: formatSchema,
});

export type StockSummaryQuery = z.infer<typeof stockSummaryQuerySchema>;
export type MovementReportQuery = z.infer<typeof movementReportQuerySchema>;
export type StockAgingQuery = z.infer<typeof stockAgingQuerySchema>;
