"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { apiRequest } from "@/lib/api-client";

/** Deletes a task after confirmation (its completion history goes with it). */
export function DeleteTaskButton({ taskId, title }: { taskId: string; title: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const remove = useApiMutation(() => apiRequest(`/checklist-settings/tasks/${taskId}`, { method: "DELETE" }));

  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)} aria-label={`Delete ${title}`}>
        <Trash2 aria-hidden />
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Delete task?">
        <div className="space-y-4">
          {remove.error && <Alert tone="error">{remove.error.message}</Alert>}
          <p className="text-sm text-slate-600">
            &ldquo;{title}&rdquo; and its completion history will be removed. To keep the history, edit the task and make it inactive instead.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              loading={remove.pending}
              onClick={async () => {
                if ((await remove.mutate(undefined)) !== undefined) {
                  setOpen(false);
                  router.refresh();
                }
              }}
            >
              Delete
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
