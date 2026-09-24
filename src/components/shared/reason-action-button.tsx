"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent, type ReactNode } from "react";
import { Alert } from "@/components/ui/alert";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/form-controls";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { apiRequest } from "@/lib/api-client";

/**
 * A button that asks for a reason in a dialog, then POSTs `{ reason }` to
 * `endpoint` (e.g. cancel an order, short-close a PO) and refreshes the page.
 */
export function ReasonActionButton({
  endpoint,
  label,
  title,
  description,
  confirmLabel,
  variant = "secondary",
  confirmVariant = "danger",
  icon,
}: {
  endpoint: string;
  label: string;
  title: string;
  description?: string;
  confirmLabel: string;
  variant?: ButtonProps["variant"];
  confirmVariant?: ButtonProps["variant"];
  icon?: ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const action = useApiMutation((body: { reason: string }) => apiRequest(endpoint, { body }));
  const fieldId = `reason-${endpoint.replace(/\W/g, "-")}`;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if ((await action.mutate({ reason })) !== undefined) {
      setOpen(false);
      setReason("");
      router.refresh();
    }
  }

  return (
    <>
      <Button
        variant={variant}
        onClick={() => {
          action.reset();
          setOpen(true);
        }}
      >
        {icon}
        {label}
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title={title} description={description}>
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          {action.error && !action.fieldErrors.reason && <Alert tone="error">{action.error.message}</Alert>}
          <Field label="Reason" htmlFor={fieldId} error={action.fieldErrors.reason} required>
            <Textarea id={fieldId} value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Back
            </Button>
            <Button type="submit" variant={confirmVariant} loading={action.pending}>
              {confirmLabel}
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
