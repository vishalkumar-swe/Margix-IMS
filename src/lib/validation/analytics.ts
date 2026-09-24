import { z } from "zod";
import { ANALYTICS_EXPORT_SECTIONS, ANALYTICS_TABS, MAX_PERIOD_DAYS, PERIOD_PRESETS, periodDays } from "@/lib/analytics";
import { dateSchema, idSchema } from "./common";

/** Filters shared by the analytics page (search params) and the CSV export. */
const analyticsFields = {
  preset: z.enum(PERIOD_PRESETS).optional(),
  /** Custom range in IST calendar days (inclusive); used when preset is "custom" or absent. */
  from: dateSchema.optional(),
  to: dateSchema.optional(),
  categoryId: idSchema.optional(),
  skuId: idSchema.optional(),
  customerId: idSchema.optional(),
  supplierId: idSchema.optional(),
};

function refineRange(value: { from?: string; to?: string }, ctx: z.RefinementCtx) {
  if (value.from && value.to) {
    if (value.to < value.from) {
      ctx.addIssue({ code: "custom", path: ["to"], message: "End date cannot be before start date." });
    } else if (periodDays({ from: value.from, to: value.to }) > MAX_PERIOD_DAYS) {
      ctx.addIssue({ code: "custom", path: ["from"], message: "Choose a range of at most three years." });
    }
  }
}

export const analyticsQuerySchema = z
  .object({ ...analyticsFields, tab: z.enum(ANALYTICS_TABS).default("overview") })
  .superRefine(refineRange);

export const analyticsExportQuerySchema = z
  .object({ ...analyticsFields, section: z.enum(ANALYTICS_EXPORT_SECTIONS) })
  .superRefine(refineRange);

export type AnalyticsQuery = z.infer<typeof analyticsQuerySchema>;
export type AnalyticsExportQuery = z.infer<typeof analyticsExportQuerySchema>;
