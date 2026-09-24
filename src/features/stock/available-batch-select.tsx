"use client";

import { useEffect, useState } from "react";
import { Select } from "@/components/ui/form-controls";
import { apiRequest } from "@/lib/api-client";
import { formatDate, todayIst } from "@/lib/dates";
import { formatQuantity } from "@/lib/format";

interface AvailableBatch {
  quantity: string;
  batch: { id: string; batchNumber: string; expiryDate: string | null };
}

interface LoadResult {
  key: string;
  batches: AvailableBatch[];
  failed: boolean;
}

/**
 * Batches of a SKU with stock in a godown, earliest expiry first (FEFO), each
 * labelled with its available quantity. Reloads when SKU or godown changes.
 */
export function AvailableBatchSelect({
  skuId,
  godownId,
  value,
  onChange,
  unit,
  label,
  invalid,
}: {
  skuId: string;
  godownId: string;
  value: string;
  onChange: (batchId: string, available: string | null) => void;
  unit?: string;
  label: string;
  invalid?: boolean;
}) {
  const key = skuId && godownId ? `${skuId}|${godownId}` : null;
  const [result, setResult] = useState<LoadResult | null>(null);

  useEffect(() => {
    if (!key) return;
    let active = true;
    const [sku, godown] = key.split("|");
    apiRequest<AvailableBatch[]>(`/stock/available-batches?skuId=${sku}&godownId=${godown}`)
      .then((batches) => active && setResult({ key, batches, failed: false }))
      .catch(() => active && setResult({ key, batches: [], failed: true }));
    return () => {
      active = false;
    };
  }, [key]);

  const current = result && result.key === key ? result : null;
  const today = todayIst();
  const loading = key !== null && current === null;
  const batches = current?.batches ?? [];

  const placeholder = !key
    ? "Select SKU and godown first"
    : loading
      ? "Loading batches…"
      : current?.failed
        ? "Could not load batches"
        : batches.length === 0
          ? "No stock in this godown"
          : "Select batch";

  return (
    <Select
      aria-label={label}
      value={value}
      disabled={!key || loading || batches.length === 0}
      aria-invalid={invalid}
      onChange={(e) => {
        const selected = batches.find((b) => b.batch.id === e.target.value);
        onChange(e.target.value, selected?.quantity ?? null);
      }}
    >
      <option value="">{placeholder}</option>
      {batches.map(({ batch, quantity }) => (
        <option key={batch.id} value={batch.id}>
          {batch.batchNumber} — {formatQuantity(quantity)} {unit ?? ""}
          {batch.expiryDate ? ` · exp ${formatDate(batch.expiryDate)}` : ""}
          {batch.expiryDate && batch.expiryDate.slice(0, 10) < today ? " · EXPIRED" : ""}
        </option>
      ))}
    </Select>
  );
}
