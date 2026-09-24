import { Badge, type BadgeTone } from "@/components/ui/badge";
import { humanize } from "@/lib/format";

/** One colour language for every status in the app. */
const STATUS_TONES: Record<string, BadgeTone> = {
  // Purchase orders
  DRAFT: "neutral",
  OPEN: "info",
  PARTIALLY_RECEIVED: "warning",
  FULLY_RECEIVED: "success",
  CANCELLED: "neutral",
  // Posted documents
  POSTED: "success",
  PARTIALLY_REVERSED: "warning",
  REVERSED: "danger",
  // Adjustments
  SUBMITTED: "warning",
  APPROVED: "success",
  REJECTED: "neutral",
  // Tally sync
  PENDING: "info",
  IN_PROGRESS: "info",
  SYNCED: "success",
  FAILED: "danger",
  // SKUs
  ACTIVE: "success",
  INACTIVE: "neutral",
  ARCHIVED: "neutral",
};

export function StatusBadge({ status }: { status: string }) {
  return <Badge tone={STATUS_TONES[status] ?? "neutral"}>{humanize(status)}</Badge>;
}

const MOVEMENT_TONES: Record<string, BadgeTone> = {
  OPENING: "info",
  INWARD: "success",
  TRANSFER_IN: "success",
  RETURN_IN: "success",
  OUTWARD: "danger",
  TRANSFER_OUT: "danger",
  RETURN_OUT: "danger",
  ADJUSTMENT: "warning",
  REVERSAL: "neutral",
};

export function MovementBadge({ type }: { type: string }) {
  return <Badge tone={MOVEMENT_TONES[type] ?? "neutral"}>{humanize(type)}</Badge>;
}
