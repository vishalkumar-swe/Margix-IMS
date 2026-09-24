import { z } from "zod";
import { timeOfDaySchema } from "./notifications";

/** Numbering master: one series' format (checked in depth by validateSeriesSettings). */
export const codeSeriesUpdateSchema = z.object({
  prefix: z.string().trim().min(1, "Prefix is required.").max(10),
  pattern: z.string().trim().min(1, "Pattern is required.").max(40),
  padding: z.coerce.number().int(),
});

export type CodeSeriesUpdateInput = z.infer<typeof codeSeriesUpdateSchema>;

/** Slow / dead stock thresholds and the time of the daily slow-moving scan (IST). */
export const stockAgingSettingsSchema = z
  .object({
    slowStockDays: z.coerce.number().int().min(1, "Enter at least 1 day.").max(3650),
    deadStockDays: z.coerce.number().int().min(1, "Enter at least 1 day.").max(3650),
    scanTime: timeOfDaySchema,
  })
  .refine((v) => v.deadStockDays >= v.slowStockDays, {
    path: ["deadStockDays"],
    message: "Dead stock must be at least as many days as slow stock.",
  });

export type StockAgingSettings = z.infer<typeof stockAgingSettingsSchema>;
