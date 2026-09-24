"use client";

import { LoaderCircle, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { apiRequest, ApiClientError } from "@/lib/api-client";
import { CHECKLIST_STATUS_LABELS, CHECKLIST_STATUSES, type ChecklistItem, type DailyChecklist } from "@/lib/checklist";
import { formatDate } from "@/lib/dates";
import { ChecklistItems } from "./checklist-items";
import { CHECKLIST_STATUS_TONE_CLASSES } from "./checklist-summary";

/**
 * The daily checklist popup: what needs attention today, most urgent first.
 * Mounted afresh each time it opens (see ChecklistProvider), so it always
 * shows current data.
 */
export function ChecklistDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [checklist, setChecklist] = useState<DailyChecklist | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [loadedVersion, setLoadedVersion] = useState(-1);
  const [pendingTaskId, setPendingTaskId] = useState<string | null>(null);
  const loading = open && loadedVersion !== version;

  useEffect(() => {
    if (!open) return;
    let active = true;
    apiRequest<DailyChecklist>("/checklist").then(
      (data) => {
        if (!active) return;
        setChecklist(data);
        setError(null);
        setLoadedVersion(version);
      },
      (cause) => {
        if (!active) return;
        setError(cause instanceof ApiClientError ? cause.message : "Could not load the checklist.");
        setLoadedVersion(version);
      },
    );
    return () => {
      active = false;
    };
  }, [open, version]);

  async function toggleTask(item: ChecklistItem, done: boolean) {
    if (!item.taskId) return;
    setPendingTaskId(item.taskId);
    try {
      await apiRequest(`/checklist/tasks/${item.taskId}/completion`, { body: { done } });
      setVersion((v) => v + 1);
    } catch (cause) {
      setError(cause instanceof ApiClientError ? cause.message : "Could not update the task.");
    } finally {
      setPendingTaskId(null);
    }
  }

  const items = checklist ? sortForDisplay(checklist.items) : [];

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Today's checklist"
      description={checklist ? `${formatDate(checklist.day)} · items that need attention` : "Items that need attention today"}
      className="max-w-2xl"
    >
      <div className="space-y-4">
        {error && <Alert tone="error">{error}</Alert>}
        {checklist && (
          <div className="flex flex-wrap gap-2">
            {CHECKLIST_STATUSES.map((status) => (
              <span key={status} className={`rounded-md px-2.5 py-1 text-xs font-medium ${CHECKLIST_STATUS_TONE_CLASSES[status]}`}>
                {CHECKLIST_STATUS_LABELS[status]} <span className="font-semibold tabular-nums">{checklist.summary[status]}</span>
              </span>
            ))}
          </div>
        )}
        {!checklist && loading && (
          <p className="flex items-center gap-2 py-6 text-sm text-slate-500">
            <LoaderCircle className="size-4 animate-spin" aria-hidden /> Loading…
          </p>
        )}
        {checklist && items.length === 0 && <p className="py-4 text-sm text-slate-500">Nothing on the checklist today.</p>}
        {items.length > 0 && (
          <div className="max-h-[60vh] overflow-y-auto">
            <ChecklistItems items={items} onNavigate={onClose} onToggleTask={toggleTask} pendingTaskId={pendingTaskId} />
          </div>
        )}
        <div className="flex items-center justify-between gap-2">
          <Button variant="ghost" size="sm" onClick={() => setVersion((v) => v + 1)} loading={loading && Boolean(checklist)}>
            {!(loading && checklist) && <RefreshCw aria-hidden />} Refresh
          </Button>
          <Button onClick={onClose}>Done</Button>
        </div>
      </div>
    </Dialog>
  );
}

/** Most urgent first; completed items last. Stable within a status. */
function sortForDisplay(items: ChecklistItem[]): ChecklistItem[] {
  return [...items].sort((a, b) => CHECKLIST_STATUSES.indexOf(a.status) - CHECKLIST_STATUSES.indexOf(b.status));
}
