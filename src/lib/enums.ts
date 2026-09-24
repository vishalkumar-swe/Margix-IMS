/**
 * Closed value sets (statuses, reason codes, roles) shared by the validation
 * schemas and the UI. Deliberately dependency-free: client components import
 * these instead of the zod schema modules, which keeps zod out of the browser
 * bundle.
 */

export const SKU_STATUSES = ["ACTIVE", "INACTIVE", "ARCHIVED"] as const;

export const PO_STATUSES = ["DRAFT", "OPEN", "PARTIALLY_RECEIVED", "FULLY_RECEIVED", "CANCELLED"] as const;

export const ROLE_CODES = ["ADMIN", "STORE_MANAGER", "WAREHOUSE_OPERATOR", "ACCOUNTS", "MANAGEMENT"] as const;

export const MOVEMENT_TYPES = [
  "OPENING",
  "INWARD",
  "OUTWARD",
  "TRANSFER_IN",
  "TRANSFER_OUT",
  "RETURN_IN",
  "RETURN_OUT",
  "ADJUSTMENT",
  "REVERSAL",
] as const;

export const TALLY_SYNC_STATUSES = ["PENDING", "IN_PROGRESS", "SYNCED", "FAILED"] as const;

export const INVOICE_STATUSES = ["OPEN", "PARTIALLY_DISPATCHED", "COMPLETE", "CANCELLED"] as const;

/** GST treatment of a priced document: CGST + SGST (same state) or IGST (across states). */
export const TAX_TYPES = ["INTRA", "INTER"] as const;

export type TaxType = (typeof TAX_TYPES)[number];

export const ADJUSTMENT_STATUSES =["SUBMITTED", "APPROVED", "REJECTED", "REVERSED"] as const;

export const ADJUSTMENT_REASONS = ["DAMAGE", "THEFT", "EXPIRY", "COUNTING_ERROR", "OTHER"] as const;

export type AdjustmentReasonCode = (typeof ADJUSTMENT_REASONS)[number];

export const ADJUSTMENT_REASON_LABELS: Record<AdjustmentReasonCode, string> = {
  DAMAGE: "Damage",
  THEFT: "Theft / shrinkage",
  EXPIRY: "Expiry",
  COUNTING_ERROR: "Counting error",
  OTHER: "Other",
};
