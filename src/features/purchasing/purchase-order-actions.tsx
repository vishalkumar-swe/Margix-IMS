"use client";

import { Pencil } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ReasonActionButton } from "@/components/shared/reason-action-button";
import { Button, buttonVariants } from "@/components/ui/button";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { apiRequest } from "@/lib/api-client";

/** Header actions for a purchase order; the page decides which are allowed. */
export function PurchaseOrderActions({
  purchaseOrderId,
  poNumber,
  canEdit,
  canSubmit,
  canCancel,
  canShortClose,
}: {
  purchaseOrderId: string;
  poNumber: string;
  canEdit: boolean;
  canSubmit: boolean;
  canCancel: boolean;
  canShortClose: boolean;
}) {
  const router = useRouter();
  const submit = useApiMutation(() => apiRequest(`/purchase-orders/${purchaseOrderId}/submit`, { method: "POST" }));

  async function onSubmitOrder() {
    if (await submit.mutate(undefined)) router.refresh();
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
          <ReasonActionButton
            endpoint={`/purchase-orders/${purchaseOrderId}/cancel`}
            label="Cancel order"
            title={`Cancel ${poNumber}`}
            confirmLabel="Cancel order"
          />
        )}
        {canShortClose && (
          <ReasonActionButton
            endpoint={`/purchase-orders/${purchaseOrderId}/short-close`}
            label="Short-close"
            title={`Short-close ${poNumber}`}
            description="The pending quantity will not be delivered. No further goods can be received against this order."
            confirmLabel="Short-close order"
          />
        )}
        {canSubmit && (
          <Button onClick={onSubmitOrder} loading={submit.pending}>
            Submit order
          </Button>
        )}
      </div>
      {submit.error && <p className="text-sm text-red-600">{submit.error.message}</p>}
    </div>
  );
}
