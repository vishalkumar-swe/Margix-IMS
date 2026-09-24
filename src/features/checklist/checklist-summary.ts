import type { ChecklistStatus } from "@/lib/checklist";

/** Chip colours for the status counts at the top of the checklist. */
export const CHECKLIST_STATUS_TONE_CLASSES: Record<ChecklistStatus, string> = {
  CRITICAL: "bg-red-50 text-red-700 ring-1 ring-inset ring-red-200",
  OVERDUE: "bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-200",
  PENDING: "bg-brand-50 text-brand-700 ring-1 ring-inset ring-brand-200",
  COMPLETED: "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200",
};
