"use client";

import { RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { apiRequest } from "@/lib/api-client";

/** Re-queues a failed delivery; the notify worker sends it on its next pass. */
export function RetryDeliveryButton({ id }: { id: string }) {
  const router = useRouter();
  const retry = useApiMutation(() => apiRequest(`/notification-settings/deliveries/${id}/retry`, { method: "POST" }));
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
      {!retry.pending && <RotateCcw aria-hidden />} Retry
    </Button>
  );
}
