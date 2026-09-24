"use client";

import { Undo2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/form-controls";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { apiRequest } from "@/lib/api-client";
import { formatEntryNo, formatSignedQuantity, negateQuantity } from "@/lib/format";

export function ReverseEntryButton({
  entryId,
  entryNo,
  quantity,
  description,
}: {
  entryId: string;
  entryNo: string;
  quantity: string;
  description: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const reverse = useApiMutation((input: { reason: string }) =>
    apiRequest(`/ledger/${entryId}/reverse`, { body: input }),
  );

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (await reverse.mutate({ reason })) {
      setOpen(false);
      router.refresh();
    }
  }

  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        <Undo2 aria-hidden /> Reverse
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={`Reverse ${formatEntryNo(entryNo)}`}
        description="The original entry stays in the ledger. A counter-entry is posted that cancels its effect on stock."
      >
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="rounded-md bg-slate-50 p-3 text-sm text-slate-700">
            {description}
            <br />
            Reversal quantity:{" "}
            <strong className="tabular-nums">{formatSignedQuantity(negateQuantity(quantity))}</strong>
          </div>
          {reverse.error && !reverse.fieldErrors.reason && <Alert tone="error">{reverse.error.message}</Alert>}
          <Field label="Reason" htmlFor={`reason-${entryId}`} error={reverse.fieldErrors.reason} required>
            <Textarea
              id={`reason-${entryId}`}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Keyed 1000 instead of 100"
              maxLength={500}
              required
            />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="danger" loading={reverse.pending}>
              Post reversal
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
