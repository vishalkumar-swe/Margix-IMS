import { z } from "zod";
import { dateSchema } from "./common";

/** Upper bounds for one upload (keeps a single transaction reasonable). */
export const MAX_IMPORT_ROWS = 5_000;
const MAX_CSV_LENGTH = 2 * 1024 * 1024;

const csvSchema = z
  .string({ error: "Choose a CSV file." })
  .min(1, "The file is empty.")
  .max(MAX_CSV_LENGTH, "The file is larger than 2 MB; split it into smaller files.");

export const skuImportSchema = z.object({ csv: csvSchema });

export const openingImportSchema = z.object({ csv: csvSchema, asOf: dateSchema });

/** The HSN/SAC master is a larger reference list (the official one has ~20k codes). */
export const MAX_HSN_IMPORT_ROWS = 30_000;
export const hsnImportSchema = z.object({
  csv: z
    .string({ error: "Choose a CSV file." })
    .min(1, "The file is empty.")
    .max(8 * 1024 * 1024, "The file is larger than 8 MB; split it into smaller files."),
});

/** Columns of each import (also documented in the downloadable templates). */
export const SKU_IMPORT_COLUMNS = {
  required: ["name", "unit"],
  /** A blank or missing code gets the next code of the SKU series. */
  optional: ["code", "category", "description", "hsn_code", "gst_rate", "batch_tracked", "tally_stock_item_name"],
} as const;

/** Existing codes are updated (description, rate, keywords); new codes are added. */
export const HSN_IMPORT_COLUMNS = {
  required: ["code", "description", "gst_rate"],
  optional: ["keywords"],
} as const;

export const OPENING_IMPORT_COLUMNS = {
  required: ["godown", "sku", "quantity"],
  optional: ["batch", "manufacturing_date", "expiry_date"],
} as const;

export interface ImportRowError {
  line: number;
  message: string;
}
