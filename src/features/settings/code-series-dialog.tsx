"use client";

import { Pencil } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/form-controls";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { apiRequest } from "@/lib/api-client";
import { formatCode, validateSeriesSettings, type CodeSeriesKey, type CodeSeriesSettings } from "@/lib/numbering";

/** Edit one code series, with a live preview of the codes it will produce. */
export function CodeSeriesDialog({
  seriesKey,
  label,
  initial,
  today,
}: {
  seriesKey: CodeSeriesKey;
  label: string;
  initial: CodeSeriesSettings;
  /** { year, fy } of today, for the preview. */
  today: { year: string; fy: string };
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ prefix: initial.prefix, pattern: initial.pattern, padding: String(initial.padding) });
  const save = useApiMutation((body: typeof form) =>
    apiRequest(`/numbering/${seriesKey}`, { method: "PATCH", body: { ...body, padding: Number(body.padding) } }),
  );

  const settings: CodeSeriesSettings = {
    prefix: form.prefix.trim().toUpperCase(),
    pattern: form.pattern.trim().toUpperCase(),
    padding: Number(form.padding),
  };
  const localErrors = validateSeriesSettings(seriesKey, settings);
  const errors = { ...localErrors, ...save.fieldErrors };
  const preview = Object.keys(localErrors).length === 0 ? formatCode(settings, 1, today) : null;
  const id = (field: string) => `series-${seriesKey}-${field}`;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (Object.keys(localErrors).length > 0) return;
    if (await save.mutate(form)) {
      setOpen(false);
      router.refresh();
    }
  }

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => {
          setForm({ prefix: initial.prefix, pattern: initial.pattern, padding: String(initial.padding) });
          save.reset();
          setOpen(true);
        }}
      >
        <Pencil aria-hidden /> Edit
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title={`Numbering: ${label}`} className="max-w-lg">
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          {save.error && !Object.keys(save.fieldErrors).length && <Alert tone="error">{save.error.message}</Alert>}
          <div className="grid grid-cols-3 gap-3">
            <Field label="Prefix" htmlFor={id("prefix")} error={errors.prefix} required>
              <Input id={id("prefix")} value={form.prefix} onChange={(e) => setForm({ ...form, prefix: e.target.value })} />
            </Field>
            <Field label="Digits" htmlFor={id("padding")} error={errors.padding} required>
              <Input id={id("padding")} inputMode="numeric" value={form.padding} onChange={(e) => setForm({ ...form, padding: e.target.value })} />
            </Field>
            <div />
            <Field label="Pattern" htmlFor={id("pattern")} error={errors.pattern} required className="col-span-3">
              <Input id={id("pattern")} value={form.pattern} onChange={(e) => setForm({ ...form, pattern: e.target.value })} className="font-mono" />
            </Field>
          </div>
          <p className="text-xs text-slate-500">
            Tokens: <code>{"{PREFIX}"}</code>, <code>{"{SEQ}"}</code> (required), <code>{"{YYYY}"}</code> calendar year,{" "}
            <code>{"{FY}"}</code> financial year (e.g. {today.fy}). The counter restarts each year when the pattern has a year.
          </p>
          <div className="rounded-md bg-slate-50 px-3 py-2 text-sm">
            First code with this format: <span className="font-mono font-semibold">{preview ?? "—"}</span>
          </div>
          <p className="text-xs text-slate-500">Codes already issued never change. The system skips any code that is already in use.</p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={save.pending} disabled={Object.keys(localErrors).length > 0}>
              Save format
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
