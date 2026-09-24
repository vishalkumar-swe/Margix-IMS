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

/** Columns of each import (also documented in the downloadable templates). */
export const SKU_IMPORT_COLUMNS = {
  required: ["code", "name", "unit"],
  optional: ["category", "description", "hsn_code", "gst_rate", "batch_tracked", "tally_stock_item_name"],
} as const;

export const OPENING_IMPORT_COLUMNS = {
  required: ["godown", "sku", "quantity"],
  optional: ["batch", "manufacturing_date", "expiry_date"],
} as const;

export interface ImportRowError {
  line: number;
  message: string;
}
