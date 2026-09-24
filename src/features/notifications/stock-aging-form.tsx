"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/form-controls";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { apiRequest } from "@/lib/api-client";

export interface StockAgingValues {
  slowStockDays: string;
  deadStockDays: string;
  scanTime: string;
}

/** Slow / dead stock thresholds (days without movement) and the daily scan time. */
export function StockAgingForm({ initial }: { initial: StockAgingValues }) {
  const router = useRouter();
  const [form, setForm] = useState(initial);
  const [saved, setSaved] = useState(false);
  const save = useApiMutation((body: StockAgingValues) =>
    apiRequest("/notification-settings/stock-aging", {
      method: "PATCH",
      body: { ...body, slowStockDays: Number(body.slowStockDays), deadStockDays: Number(body.deadStockDays) },
    }),
  );
  const errors = save.fieldErrors;
  const set = (patch: Partial<StockAgingValues>) => {
    setSaved(false);
    setForm({ ...form, ...patch });
  };

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (await save.mutate(form)) {
      setSaved(true);
      router.refresh();
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {save.error && !Object.keys(errors).length && <Alert tone="error">{save.error.message}</Alert>}
      {saved && <Alert tone="success">Saved. The next daily scan uses the new values.</Alert>}
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Slow-moving after (days)" htmlFor="aging-slow" error={errors.slowStockDays} required>
          <Input id="aging-slow" inputMode="numeric" value={form.slowStockDays} onChange={(e) => set({ slowStockDays: e.target.value })} />
        </Field>
        <Field label="Dead stock after (days)" htmlFor="aging-dead" error={errors.deadStockDays} required>
          <Input id="aging-dead" inputMode="numeric" value={form.deadStockDays} onChange={(e) => set({ deadStockDays: e.target.value })} />
        </Field>
        <Field label="Daily scan time (IST)" htmlFor="aging-scan" error={errors.scanTime} required>
          <Input id="aging-scan" type="time" value={form.scanTime} onChange={(e) => set({ scanTime: e.target.value })} />
        </Field>
      </div>
      <div className="flex justify-end">
        <Button type="submit" loading={save.pending}>
          Save
        </Button>
      </div>
    </form>
  );
}
