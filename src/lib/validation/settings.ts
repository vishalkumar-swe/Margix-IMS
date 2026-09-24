import { z } from "zod";

/** Numbering master: one series' format (checked in depth by validateSeriesSettings). */
export const codeSeriesUpdateSchema = z.object({
  prefix: z.string().trim().min(1, "Prefix is required.").max(10),
  pattern: z.string().trim().min(1, "Pattern is required.").max(40),
  padding: z.coerce.number().int(),
});

export type CodeSeriesUpdateInput = z.infer<typeof codeSeriesUpdateSchema>;
