import { Badge, type BadgeTone } from "@/components/ui/badge";
import { CHECKLIST_STATUS_LABELS, type ChecklistStatus } from "@/lib/checklist";

const TONES: Record<ChecklistStatus, BadgeTone> = {
  COMPLETED: "success",
  PENDING: "info",
  OVERDUE: "warning",
  CRITICAL: "danger",
};

export function ChecklistStatusBadge({ status }: { status: ChecklistStatus }) {
  return <Badge tone={TONES[status]}>{CHECKLIST_STATUS_LABELS[status]}</Badge>;
}
