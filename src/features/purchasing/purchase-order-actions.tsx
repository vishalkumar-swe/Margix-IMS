"use client";

import { Pencil } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/form-controls";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { apiRequest } from "@/lib/api-client";

/** Header actions for a purchase order; the page decides which are allowed. */
export function PurchaseOrderActions({
  purchaseOrderId,
  poNumber,
  canEdit,
  canSubmit,
  canCancel,
}: {
  purchaseOrderId: string;
  poNumber: string;
  canEdit: boolean;
  canSubmit: boolean;
  canCancel: boolean;
}) {
  const router = useRouter();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState("");

  const submit = useApiMutation(() => apiRequest(`/purchase-orders/${purchaseOrderId}/submit`, { method: "POST" }));
  const cancel = useApiMutation((body: { reason: string }) =>
    apiRequest(`/purchase-orders/${purchaseOrderId}/cancel`, { body }),
  );

  async function onSubmitOrder() {
    if (await submit.mutate(undefined)) router.refresh();
  }

  async function onCancel(event: FormEvent) {
    event.preventDefault();
    if (await cancel.mutate({ reason })) {
      setCancelOpen(false);
      router.refresh();
    }
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap gap-2">
        {canEdit && (
          <Link href={`/purchase-orders/${purchaseOrderId}/edit`} className={buttonVariants({ variant: "secondary" })}>
            <Pencil aria-hidden /> Edit
          </Link>
        )}
        {canCancel && (
          <Button variant="secondary" onClick={() => setCancelOpen(true)}>
            Cancel order
          </Button>
        )}
        {canSubmit && (
          <Button onClick={onSubmitOrder} loading={submit.pending}>
            Submit order
          </Button>
        )}
      </div>
      {submit.error && <p className="text-sm text-red-600">{submit.error.message}</p>}

      <Dialog open={cancelOpen} onClose={() => setCancelOpen(false)} title={`Cancel ${poNumber}`}>
        <form onSubmit={onCancel} className="space-y-4">
          {cancel.error && !cancel.fieldErrors.reason && <Alert tone="error">{cancel.error.message}</Alert>}
          <Field label="Reason" htmlFor="cancel-reason" error={cancel.fieldErrors.reason} required>
            <Textarea id="cancel-reason" value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setCancelOpen(false)}>
              Keep order
            </Button>
            <Button type="submit" variant="danger" loading={cancel.pending}>
              Cancel order
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
