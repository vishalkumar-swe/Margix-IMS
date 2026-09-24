"use client";

import { Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/form-controls";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { apiRequest } from "@/lib/api-client";
import { NOTIFICATION_CHANNEL_LABELS, type NotificationChannelCode } from "@/lib/enums";

type DeliveryResult =
  | { status: "SENT"; providerMessageId?: string | null }
  | { status: "SKIPPED"; reason: string }
  | { status: "FAILED"; error: string; retryable: boolean };

interface TestResult {
  recipient: string;
  result: DeliveryResult;
}

/** "Send test" for one channel: sends a message right away and shows what happened. */
export function ChannelTestButton({ channel, defaultRecipient }: { channel: NotificationChannelCode; defaultRecipient: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [recipient, setRecipient] = useState(defaultRecipient);
  const [outcome, setOutcome] = useState<TestResult | null>(null);
  const send = useApiMutation((to: string) =>
    apiRequest<TestResult>(`/notification-settings/channels/${channel}/test`, { body: { recipient: to || undefined } }),
  );
  const label = NOTIFICATION_CHANNEL_LABELS[channel];
  const needsRecipient = channel !== "IN_APP";

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setOutcome(null);
    const result = await send.mutate(recipient.trim());
    if (result) {
      setOutcome(result);
      router.refresh();
    }
  }

  return (
    <>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => {
          setRecipient(defaultRecipient);
          setOutcome(null);
          send.reset();
          setOpen(true);
        }}
      >
        <Send aria-hidden /> Send test
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title={`Send a test ${label} message`}>
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          {send.error && !send.fieldErrors.recipient && <Alert tone="error">{send.error.message}</Alert>}
          {outcome && <Outcome outcome={outcome} />}
          {needsRecipient ? (
            <Field
              label={channel === "EMAIL" ? "E-mail address" : "WhatsApp number"}
              htmlFor={`test-${channel}`}
              error={send.fieldErrors.recipient}
              hint={channel === "WHATSAPP" ? "With country code. The number must have opted in to your business." : undefined}
              required
            >
              <Input
                id={`test-${channel}`}
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                placeholder={channel === "EMAIL" ? "you@example.com" : "+91 98765 43210"}
              />
            </Field>
          ) : (
            <p className="text-sm text-slate-600">A test notification will appear under the bell for you.</p>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Close
            </Button>
            <Button type="submit" loading={send.pending}>
              Send test
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}

function Outcome({ outcome }: { outcome: TestResult }) {
  const { result } = outcome;
  if (result.status === "SENT") return <Alert tone="success">Sent to {outcome.recipient}.</Alert>;
  if (result.status === "SKIPPED") {
    return (
      <Alert tone="info" title="Not sent (log-only mode)">
        {result.reason}. Configure the channel&apos;s environment variables to send for real.
      </Alert>
    );
  }
  return (
    <Alert tone="error" title="Delivery failed">
      {result.error}
    </Alert>
  );
}
