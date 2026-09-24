"use client";

import { KeyRound, Pause, Play, RotateCcw, Send, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { apiRequest } from "@/lib/api-client";
import { SecretReveal } from "./secret-reveal";

/** Send test · pause/resume · new secret · delete, for one webhook endpoint. */
export function WebhookActions({ id, name, isActive }: { id: string; name: string; isActive: boolean }) {
  const router = useRouter();
  const [confirm, setConfirm] = useState<"delete" | "rotate" | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const base = `/integrations/webhooks/${id}`;

  const test = useApiMutation(() => apiRequest<{ queued: number }>(`${base}/test`, { method: "POST" }));
  const toggle = useApiMutation(() => apiRequest(base, { method: "PATCH", body: { isActive: !isActive } }));
  const rotate = useApiMutation(() => apiRequest<{ secret: string }>(`${base}/rotate-secret`, { method: "POST" }));
  const remove = useApiMutation(() => apiRequest(base, { method: "DELETE" }));
  const error = test.error ?? toggle.error;

  return (
    <div className="flex flex-wrap items-center justify-end gap-1">
      <Button
        variant="ghost"
        size="sm"
        loading={test.pending}
        disabled={!isActive}
        title={isActive ? "Queue a webhook.test event for this endpoint" : "Resume the webhook to send a test"}
        onClick={async () => {
          setNotice(null);
          if (await test.mutate(undefined)) {
            setNotice("Test queued — it appears under Recent deliveries within a minute.");
            router.refresh();
          }
        }}
      >
        {!test.pending && <Send aria-hidden />} Test
      </Button>
      <Button
        variant="ghost"
        size="sm"
        loading={toggle.pending}
        onClick={async () => {
          if (await toggle.mutate(undefined)) router.refresh();
        }}
      >
        {!toggle.pending && (isActive ? <Pause aria-hidden /> : <Play aria-hidden />)} {isActive ? "Pause" : "Resume"}
      </Button>
      <Button variant="ghost" size="sm" onClick={() => {
          setSecret(null);
          rotate.reset();
          setConfirm("rotate");
        }}>
        <KeyRound aria-hidden /> New secret
      </Button>
      <Button variant="ghost" size="sm" onClick={() => {
          remove.reset();
          setConfirm("delete");
        }}>
        <Trash2 aria-hidden /> Delete
      </Button>
      {(notice || error) && (
        <p role="status" className={`basis-full text-right text-xs ${error ? "text-red-700" : "text-emerald-700"}`}>
          {error?.message ?? notice}
        </p>
      )}

      <Dialog
        open={confirm === "rotate"}
        onClose={() => setConfirm(null)}
        title={`New signing secret for “${name}”`}
        description="The current secret stops working immediately. Update the receiving system with the new one."
      >
        <div className="space-y-4">
          {rotate.error && <Alert tone="error">{rotate.error.message}</Alert>}
          {secret && <SecretReveal secret={secret} />}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setConfirm(null)}>
              {secret ? "Done" : "Cancel"}
            </Button>
            {!secret && (
              <Button
                loading={rotate.pending}
                onClick={async () => {
                  const result = await rotate.mutate(undefined);
                  if (result) setSecret(result.secret);
                }}
              >
                Issue new secret
              </Button>
            )}
          </div>
        </div>
      </Dialog>

      <Dialog
        open={confirm === "delete"}
        onClose={() => setConfirm(null)}
        title={`Delete webhook “${name}”?`}
        description="No more events are sent to it and its delivery history is removed. The audit trail keeps a record."
      >
        <div className="space-y-4">
          {remove.error && <Alert tone="error">{remove.error.message}</Alert>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setConfirm(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              loading={remove.pending}
              onClick={async () => {
                if (await remove.mutate(undefined)) {
                  setConfirm(null);
                  router.refresh();
                }
              }}
            >
              Delete webhook
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}

/** Re-queues a failed delivery; the worker sends it on its next pass. */
export function RetryWebhookDeliveryButton({ id }: { id: string }) {
  const router = useRouter();
  const retry = useApiMutation(() => apiRequest(`/integrations/webhooks/deliveries/${id}/retry`, { method: "POST" }));
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
