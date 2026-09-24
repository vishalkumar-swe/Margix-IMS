"use client";

import { Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input, Select, Textarea } from "@/components/ui/form-controls";
import { Table, TBody, TD, TH, THead } from "@/components/ui/table";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { apiRequest } from "@/lib/api-client";
import type { NamedOption, SkuOption } from "@/lib/options";

interface Line {
  key: string;
  skuId: string;
  batchNumber: string;
  expiryDate: string;
  quantity: string;
}

const emptyLine = (): Line => ({ key: crypto.randomUUID(), skuId: "", batchNumber: "", expiryDate: "", quantity: "" });

/** Go-live stock per godown; each line posts an OPENING ledger entry. */
export function OpeningBalanceForm({ godowns, skus, today }: { godowns: NamedOption[]; skus: SkuOption[]; today: string }) {
  const router = useRouter();
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [godownId, setGodownId] = useState(godowns[0]?.id ?? "");
  const [asOf, setAsOf] = useState(today);
  const [remarks, setRemarks] = useState("");
  const [lines, setLines] = useState<Line[]>([emptyLine()]);

  const post = useApiMutation((body: unknown) => apiRequest<{ openingNumber: string }>("/opening-balances", { body }));
  const errors = post.fieldErrors;
  const skuById = new Map(skus.map((s) => [s.id, s]));

  function updateLine(key: string, patch: Partial<Line>) {
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const result = await post.mutate({
      godownId,
      asOf,
      remarks: remarks || undefined,
      idempotencyKey,
      items: lines.map((line) => ({
        skuId: line.skuId,
        batchNumber: line.batchNumber || undefined,
        expiryDate: line.expiryDate || undefined,
        quantity: line.quantity,
      })),
    });
    if (result) {
      router.push("/opening-stock");
      router.refresh();
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6" noValidate>
      {post.error && !Object.keys(errors).length && <Alert tone="error">{post.error.message}</Alert>}

      <Card>
        <CardHeader title="Details" />
        <CardBody className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="Godown" htmlFor="godownId" error={errors.godownId} required>
            <Select id="godownId" value={godownId} onChange={(e) => setGodownId(e.target.value)}>
              {godowns.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name} ({g.code})
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Balance as of" htmlFor="asOf" error={errors.asOf} required>
            <Input id="asOf" type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} />
          </Field>
          <Field label="Remarks" htmlFor="remarks" error={errors.remarks} className="md:col-span-2">
            <Textarea id="remarks" value={remarks} maxLength={500} onChange={(e) => setRemarks(e.target.value)} />
          </Field>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Lines"
          actions={
            <Button variant="secondary" size="sm" onClick={() => setLines([...lines, emptyLine()])}>
              <Plus aria-hidden /> Add line
            </Button>
          }
        />
        <Table>
          <THead>
            <tr>
              <TH className="w-1/3">SKU</TH>
              <TH>Batch</TH>
              <TH>Expiry</TH>
              <TH>Quantity</TH>
              <TH className="sr-only">Remove</TH>
            </tr>
          </THead>
          <TBody>
            {lines.map((line, index) => {
              const sku = skuById.get(line.skuId);
              const err = (field: string) => errors[`items.${index}.${field}`];
              const tracked = sku?.isBatchTracked ?? true;
              return (
                <tr key={line.key} className="align-top">
                  <TD>
                    <Select
                      aria-label={`SKU for line ${index + 1}`}
                      value={line.skuId}
                      onChange={(e) => updateLine(line.key, { skuId: e.target.value })}
                      aria-invalid={Boolean(err("skuId"))}
                    >
                      <option value="">Select SKU</option>
                      {skus.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.code} · {s.name}
                        </option>
                      ))}
                    </Select>
                  </TD>
                  <TD>
                    {tracked ? (
                      <Input
                        aria-label={`Batch for line ${index + 1}`}
                        value={line.batchNumber}
                        onChange={(e) => updateLine(line.key, { batchNumber: e.target.value })}
                        aria-invalid={Boolean(err("batchNumber"))}
                        className="w-36"
                      />
                    ) : (
                      <span className="text-xs text-slate-400">Not tracked</span>
                    )}
                    {err("batchNumber") && <p className="mt-1 text-xs text-red-600">{err("batchNumber")}</p>}
                  </TD>
                  <TD>
                    {tracked && (
                      <Input
                        type="date"
                        aria-label={`Expiry for line ${index + 1}`}
                        value={line.expiryDate}
                        onChange={(e) => updateLine(line.key, { expiryDate: e.target.value })}
                        className="w-40"
                      />
                    )}
                  </TD>
                  <TD>
                    <div className="flex items-center gap-2">
                      <Input
                        aria-label={`Quantity for line ${index + 1}`}
                        inputMode="decimal"
                        value={line.quantity}
                        onChange={(e) => updateLine(line.key, { quantity: e.target.value })}
                        className="w-28"
                        aria-invalid={Boolean(err("quantity"))}
                      />
                      <span className="text-xs text-slate-500">{sku?.unit}</span>
                    </div>
                    {err("quantity") && <p className="mt-1 text-xs text-red-600">{err("quantity")}</p>}
                  </TD>
                  <TD className="text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setLines(lines.filter((l) => l.key !== line.key))}
                      disabled={lines.length === 1}
                      aria-label={`Remove line ${index + 1}`}
                    >
                      <Trash2 aria-hidden />
                    </Button>
                  </TD>
                </tr>
              );
            })}
          </TBody>
        </Table>
      </Card>

      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={() => router.back()}>
          Cancel
        </Button>
        <Button type="submit" loading={post.pending}>
          Post opening stock
        </Button>
      </div>
    </form>
  );
}
