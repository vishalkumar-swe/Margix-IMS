import { z } from "zod";

/**
 * Shared field schemas. Quantities travel as decimal strings end-to-end so no
 * value ever passes through a binary float.
 */

export const idSchema = z.uuid("Invalid identifier.");

export const idempotencyKeySchema = z.uuid("Invalid idempotency key.").optional();

const POSITIVE_QTY = /^(?:\d{1,15})(?:\.\d{1,3})?$/;
const SIGNED_QTY = /^-?(?:\d{1,15})(?:\.\d{1,3})?$/;

function normaliseNumberInput(value: unknown): unknown {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "string") return value.trim();
  return value;
}

/** Strictly positive quantity with at most 3 decimal places, e.g. "12.5". */
export const quantitySchema = z.preprocess(
  normaliseNumberInput,
  z
    .string({ error: "Quantity is required." })
    .regex(POSITIVE_QTY, "Enter a positive number with at most 3 decimal places.")
    .refine((v) => Number(v) > 0, "Quantity must be greater than zero."),
);

/** Zero or positive quantity (e.g. accepted quantity on a GRN line). */
export const nonNegativeQuantitySchema = z.preprocess(
  normaliseNumberInput,
  z.string({ error: "Quantity is required." }).regex(POSITIVE_QTY, "Enter a number with at most 3 decimal places."),
);

/** Signed, non-zero quantity (adjustments). */
export const signedQuantitySchema = z.preprocess(
  normaliseNumberInput,
  z
    .string({ error: "Quantity is required." })
    .regex(SIGNED_QTY, "Enter a number with at most 3 decimal places.")
    .refine((v) => Number(v) !== 0, "Quantity cannot be zero."),
);

/**
 * Exact comparison of two decimal strings (≤ 3 decimal places) without
 * floating point. Returns -1, 0 or 1.
 */
export function compareQuantities(a: string, b: string): number {
  const scaled = (v: string) => {
    const negative = v.startsWith("-");
    const [int, frac = ""] = v.replace("-", "").split(".");
    const value = BigInt(int + frac.padEnd(3, "0").slice(0, 3));
    return negative ? -value : value;
  };
  const x = scaled(a);
  const y = scaled(b);
  return x === y ? 0 : x < y ? -1 : 1;
}

/** Money / rate with at most 2 decimal places. */
export const amountSchema = z.preprocess(
  normaliseNumberInput,
  z.string().regex(/^\d{1,15}(?:\.\d{1,2})?$/, "Enter an amount with at most 2 decimal places."),
);

export const gstRateSchema = z.preprocess(
  normaliseNumberInput,
  z
    .string()
    .regex(/^\d{1,2}(?:\.\d{1,2})?$/, "Enter a GST rate between 0 and 99.99.")
    .refine((v) => Number(v) <= 99.99, "GST rate cannot exceed 99.99."),
);

/** Calendar date as YYYY-MM-DD. */
export const dateSchema = z.iso.date("Enter a valid date (YYYY-MM-DD).");

/** Optional free text: trimmed, empty string treated as absent. */
export function optionalText(max: number) {
  return z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.string().trim().max(max).optional(),
  );
}

/**
 * For updates: omitted = leave unchanged, empty string = clear (null),
 * otherwise the trimmed value.
 */
export function clearableText(max: number) {
  return z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? null : v),
    z.string().trim().max(max).nullable().optional(),
  );
}

export function requiredText(max: number, label: string) {
  return z.string({ error: `${label} is required.` }).trim().min(1, `${label} is required.`).max(max);
}

/** Master-data code: uppercase letters, digits, dash, underscore, slash, dot. */
export const codeSchema = z
  .string({ error: "Code is required." })
  .trim()
  .min(1, "Code is required.")
  .max(40)
  .transform((v) => v.toUpperCase())
  .pipe(z.string().regex(/^[A-Z0-9][A-Z0-9._/-]*$/, "Use letters, digits, '-', '_', '/', '.'."));

/** superRefine helper: flags document lines whose key repeats. */
export function noDuplicateLines<T>(keyOf: (item: T) => string, field: string) {
  return (value: { items: T[] }, ctx: z.RefinementCtx) => {
    const seen = new Set<string>();
    value.items.forEach((item, index) => {
      const key = keyOf(item);
      if (seen.has(key)) {
        ctx.addIssue({ code: "custom", path: ["items", index, field], message: "This line is duplicated." });
      }
      seen.add(key);
    });
  };
}

export const pageQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
  q: optionalText(100),
});

export type PageQuery = z.infer<typeof pageQuerySchema>;
