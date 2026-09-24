"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Select, Textarea } from "@/components/ui/form-controls";
import { BatchLinesEditor, emptyBatchLine, type BatchLine } from "@/features/stock/batch-lines-editor";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { apiRequest } from "@/lib/api-client";
import { formatQuantity } from "@/lib/format";
import type { NamedOption, SkuOption } from "@/lib/options";
import { pushFresh } from "@/lib/navigation";

export function TransferForm({ godowns, skus }: { godowns: NamedOption[]; skus: SkuOption[] }) {
  const router = useRouter();
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [fromGodownId, setFromGodownId] = useState(godowns[0]?.id ?? "");
  const [toGodownId, setToGodownId] = useState(godowns[1]?.id ?? "");
  const [remarks, setRemarks] = useState("");
  const [lines, setLines] = useState<BatchLine[]>([emptyBatchLine()]);

  const post = useApiMutation((body: unknown) => apiRequest<{ id: string }>("/transfers", { body }));
  const errors = post.fieldErrors;

  function changeSource(godownId: string) {
    setFromGodownId(godownId);
    // The "To" list excludes whatever "From" is now set to; if that was the selected
    // destination, clear it instead of silently submitting the same godown on both ends.
    setToGodownId((current) => (current === godownId ? "" : current));
    setLines((current) => current.map((line) => ({ ...line, batchId: "", available: null })));
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const transfer = await post.mutate({
      fromGodownId,
      toGodownId,
      remarks: remarks || undefined,
      idempotencyKey,
      items: lines.map(({ skuId, batchId, quantity }) => ({ skuId, batchId, quantity })),
    });
    if (transfer) {
      pushFresh(router, `/transfers/${transfer.id}`);
    }
  }

  const stockError = post.error?.code === "INSUFFICIENT_STOCK" ? (post.error.details as Record<string, string>) : null;

  return (
    <form onSubmit={onSubmit} className="space-y-6" noValidate>
      {post.error && !Object.keys(errors).length && (
        <Alert tone="error" title={post.error.message}>
          {stockError &&
            `${stockError.sku} batch ${stockError.batch} in ${stockError.godown}: available ${formatQuantity(stockError.available)}, requested ${formatQuantity(stockError.requested)}.`}
        </Alert>
      )}

      <Card>
        <CardHeader title="Transfer details" description="Batches keep their identity; only their location changes." />
        <CardBody className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="From godown" htmlFor="fromGodownId" error={errors.fromGodownId} required>
            <Select id="fromGodownId" value={fromGodownId} onChange={(e) => changeSource(e.target.value)}>
              {godowns.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name} ({g.code})
                </option>
              ))}
            </Select>
          </Field>
          <Field label="To godown" htmlFor="toGodownId" error={errors.toGodownId} required>
            <Select id="toGodownId" value={toGodownId} onChange={(e) => setToGodownId(e.target.value)}>
              <option value="">Select destination</option>
              {godowns
                .filter((g) => g.id !== fromGodownId)
                .map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name} ({g.code})
                  </option>
                ))}
            </Select>
          </Field>
          <Field label="Remarks" htmlFor="remarks" error={errors.remarks} className="md:col-span-2">
            <Textarea id="remarks" value={remarks} maxLength={500} onChange={(e) => setRemarks(e.target.value)} />
          </Field>
        </CardBody>
      </Card>

      <BatchLinesEditor
        description="Pick batches from the source godown."
        lines={lines}
        onChange={setLines}
        skus={skus}
        godownId={fromGodownId}
        errors={errors}
      />

      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={() => router.back()}>
          Cancel
        </Button>
        <Button type="submit" loading={post.pending}>
          Post transfer
        </Button>
      </div>
    </form>
  );
}
