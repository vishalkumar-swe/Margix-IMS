import { z } from "zod";

/** A scanned or typed barcode / QR value to resolve. */
export const scanLookupQuerySchema = z.object({
  code: z.string({ error: "Code is required." }).trim().min(1, "Code is required.").max(300),
});

export type ScanLookupQuery = z.infer<typeof scanLookupQuerySchema>;
