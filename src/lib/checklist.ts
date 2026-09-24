/**
 * Daily checklist vocabulary shared by the server (which computes the items)
 * and the UI (popup, admin screen). Dependency-free.
 */

export const CHECKLIST_STATUSES = ["CRITICAL", "OVERDUE", "PENDING", "COMPLETED"] as const;

export type ChecklistStatus = (typeof CHECKLIST_STATUSES)[number];

export const CHECKLIST_STATUS_LABELS: Record<ChecklistStatus, string> = {
  COMPLETED: "Completed",
  PENDING: "Pending",
  OVERDUE: "Overdue",
  CRITICAL: "Critical",
};

/** System items, derived from live data. Administrators can switch each one off. */
export const CHECKLIST_SYSTEM_ITEMS = [
  {
    key: "LOW_STOCK",
    label: "Low-stock items",
    description: "Products at or below their reorder level. Critical when any is out of stock.",
  },
  {
    key: "SLOW_MOVING",
    label: "Slow-moving stock",
    description: "Stock with no movement for the configured number of days.",
  },
  {
    key: "PENDING_PURCHASE_ORDERS",
    label: "Pending purchase orders",
    description: "Open or partially received. Overdue once the expected date has passed.",
  },
  {
    key: "INVOICES_AWAITING_DISPATCH",
    label: "Invoices awaiting dispatch",
    description: "Sales invoices with nothing dispatched yet. Overdue after 3 days.",
  },
  {
    key: "PARTIAL_DISPATCHES",
    label: "Pending dispatches",
    description: "Invoices dispatched in part, with quantity still to send.",
  },
  {
    key: "OUTSTANDING_INVOICES",
    label: "Outstanding invoices",
    description: "Invoices still not fully dispatched 7 days after the invoice date.",
  },
  {
    key: "RECENT_RETURNS",
    label: "Recent returns",
    description: "Customer and supplier returns of the last 7 days, to review.",
  },
  {
    key: "PENDING_APPROVALS",
    label: "Adjustments awaiting approval",
    description: "Stock adjustments waiting for a checker. Overdue after a day.",
  },
  {
    key: "TALLY_SYNC_FAILURES",
    label: "Tally sync failures",
    description: "Documents that could not be posted to Tally. Critical.",
  },
  {
    key: "NOTIFICATION_FAILURES",
    label: "Notification failures",
    description: "E-mail or WhatsApp messages that could not be delivered.",
  },
] as const;

export type ChecklistSystemItemKey = (typeof CHECKLIST_SYSTEM_ITEMS)[number]["key"];

export const CHECKLIST_SYSTEM_ITEM_KEYS = CHECKLIST_SYSTEM_ITEMS.map((item) => item.key) as [
  ChecklistSystemItemKey,
  ...ChecklistSystemItemKey[],
];

/** One line of a user's checklist for the day. */
export interface ChecklistItem {
  /** "system:LOW_STOCK" or "task:<uuid>". */
  id: string;
  kind: "system" | "task";
  title: string;
  detail: string | null;
  status: ChecklistStatus;
  /** Records behind a system item. */
  count: number | null;
  href: string | null;
  /** Admin tasks: due time "HH:MM" (IST). */
  dueTime: string | null;
  /** Admin tasks: the task id, for ticking it done. */
  taskId: string | null;
}

export interface DailyChecklist {
  /** IST calendar day, YYYY-MM-DD. */
  day: string;
  items: ChecklistItem[];
  summary: Record<ChecklistStatus, number>;
  /** Ask before signing out while items are unresolved. */
  confirmOnLogout: boolean;
}

/** Items still needing attention (anything not completed), most urgent first. */
export function unresolvedItems(items: ChecklistItem[]): ChecklistItem[] {
  return items
    .filter((item) => item.status !== "COMPLETED")
    .sort((a, b) => CHECKLIST_STATUSES.indexOf(a.status) - CHECKLIST_STATUSES.indexOf(b.status));
}
