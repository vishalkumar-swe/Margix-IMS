"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/form-controls";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { apiRequest } from "@/lib/api-client";

/** Approve (posts to the ledger) or reject (note required) a submitted adjustment. */
export function AdjustmentReview({ adjustmentId }: { adjustmentId: string }) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [decision, setDecision] = useState<"approve" | "reject">("approve");

  const review = useApiMutation((action: "approve" | "reject") =>
    apiRequest(`/adjustments/${adjustmentId}/${action}`, { body: { note: note || undefined } }),
  );

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const action = submitter?.value === "reject" ? "reject" : "approve";
    setDecision(action);
    if (await review.mutate(action)) router.refresh();
  }

  return (
    <Card>
      <CardHeader title="Review" description="Approving posts the adjustment to the stock ledger immediately." />
      <form onSubmit={onSubmit} noValidate>
        <CardBody className="space-y-4">
          {review.error && !review.fieldErrors.note && <Alert tone="error">{review.error.message}</Alert>}
          <Field
            label="Review note"
            htmlFor="review-note"
            error={review.fieldErrors.note}
            hint="Required when rejecting."
          >
            <Textarea id="review-note" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="submit" value="reject" variant="secondary" loading={review.pending && decision === "reject"} disabled={review.pending}>
              Reject
            </Button>
            <Button type="submit" value="approve" loading={review.pending && decision === "approve"} disabled={review.pending}>
              Approve & post
            </Button>
          </div>
        </CardBody>
      </form>
    </Card>
  );
}
