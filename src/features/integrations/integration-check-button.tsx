"use client";

import { PlugZap } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { apiRequest } from "@/lib/api-client";
import { cn } from "@/lib/cn";

interface CheckResult {
  ok: boolean;
  message: string;
  latencyMs?: number;
}

/** "Check connection": a live, side-effect-free check (nothing is sent), with the result shown inline. */
export function IntegrationCheckButton({ integrationKey }: { integrationKey: string }) {
  const [result, setResult] = useState<CheckResult | null>(null);
  const check = useApiMutation(() => apiRequest<CheckResult>(`/integrations/${integrationKey}/check`, { method: "POST" }));
  const failed = check.error ? { ok: false, message: check.error.message } : null;
  const shown = failed ?? result;

  return (
    <div className="space-y-2">
      <Button
        variant="secondary"
        size="sm"
        loading={check.pending}
        onClick={async () => {
          setResult(null);
          const outcome = await check.mutate(undefined);
          if (outcome) setResult(outcome);
        }}
      >
        {!check.pending && <PlugZap aria-hidden />} Check connection
      </Button>
      {shown && (
        <p role="status" className={cn("text-xs", shown.ok ? "text-emerald-700" : "text-red-700")}>
          {shown.ok ? "✓ " : "✗ "}
          {shown.message}
          {result?.latencyMs !== undefined && <span className="text-slate-500"> · {result.latencyMs} ms</span>}
        </p>
      )}
    </div>
  );
}
