"use client";

import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { apiRequest } from "@/lib/api-client";

interface SyncSummary {
  enabled: boolean;
  processed: number;
  synced: number;
  failed: number;
}

/** Runs the sync worker once, on demand. */
export function RunTallySyncButton() {
  const router = useRouter();
  const [summary, setSummary] = useState<SyncSummary | null>(null);
  const run = useApiMutation(() => apiRequest<SyncSummary>("/tally/sync", { method: "POST" }));

  async function onClick() {
    const result = await run.mutate(undefined);
    if (result) {
      setSummary(result);
      router.refresh();
    }
  }

  return (
    <div className="flex items-center gap-3">
      {summary && (
        <p className="text-sm text-slate-600" role="status">
          {summary.enabled
            ? `Processed ${summary.processed}: ${summary.synced} synced, ${summary.failed} failed.`
            : "Tally integration is disabled (TALLY_MODE=disabled)."}
        </p>
      )}
      {run.error && <p className="text-sm text-red-600">{run.error.message}</p>}
      <Button onClick={onClick} loading={run.pending}>
        {!run.pending && <RefreshCw aria-hidden />} Run sync now
      </Button>
    </div>
  );
}

/** Re-queues a failed job immediately. */
export function RetryTallyJobButton({ jobId }: { jobId: string }) {
  const router = useRouter();
  const retry = useApiMutation(() => apiRequest(`/tally/jobs/${jobId}/retry`, { method: "POST" }));

  return (
    <Button
      variant="ghost"
      size="sm"
      loading={retry.pending}
      title={retry.error?.message}
      onClick={async () => {
        if (await retry.mutate(undefined)) router.refresh();
      }}
    >
      Retry
    </Button>
  );
}
