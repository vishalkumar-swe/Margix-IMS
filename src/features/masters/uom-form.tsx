"use client";

import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/form-controls";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { apiRequest } from "@/lib/api-client";

export function UomForm() {
  const router = useRouter();
  const [form, setForm] = useState({ code: "", name: "", decimalPlaces: 0 });
  const create = useApiMutation((body: typeof form) => apiRequest("/uoms", { body }));
  const errors = create.fieldErrors;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (await create.mutate(form)) {
      setForm({ code: "", name: "", decimalPlaces: 0 });
      router.refresh();
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-1" noValidate>
      <div className="flex flex-wrap items-start gap-2">
        <Input
          aria-label="Unit code"
          placeholder="Code (e.g. LTR)"
          value={form.code}
          onChange={(e) => setForm({ ...form, code: e.target.value })}
          className="w-32"
          aria-invalid={Boolean(errors.code)}
        />
        <Input
          aria-label="Unit name"
          placeholder="Name"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          className="min-w-32 flex-1"
          aria-invalid={Boolean(errors.name)}
        />
        <Select
          aria-label="Decimal places"
          value={form.decimalPlaces}
          onChange={(e) => setForm({ ...form, decimalPlaces: Number(e.target.value) })}
          className="w-40"
        >
          <option value={0}>Whole numbers</option>
          <option value={1}>1 decimal</option>
          <option value={2}>2 decimals</option>
          <option value={3}>3 decimals</option>
        </Select>
        <Button type="submit" variant="secondary" loading={create.pending}>
          <Plus aria-hidden /> Add
        </Button>
      </div>
      {create.error && (
        <p className="text-xs text-red-600">{errors.code ?? errors.name ?? create.error.message}</p>
      )}
    </form>
  );
}
