"use client";

import { Download, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/form-controls";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { apiRequest } from "@/lib/api-client";
import type { ImportRowError } from "@/lib/validation/imports";

/**
 * Upload a CSV to an import endpoint. The whole file is validated first;
 * row errors are listed by line and nothing is imported until all are fixed.
 */
export function CsvImportDialog<TResult>({
  endpoint,
  title,
  description,
  templateHref,
  asOf,
  summarise,
}: {
  endpoint: string;
  title: string;
  description: string;
  templateHref: string;
  /** When set, the upload also asks for an "as of" date. */
  asOf?: { label: string; defaultValue: string };
  summarise: (result: TResult) => string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [date, setDate] = useState(asOf?.defaultValue ?? "");
  const [done, setDone] = useState<string | null>(null);
  const upload = useApiMutation((body: Record<string, string>) => apiRequest<TResult>(endpoint, { body }));

  const rowErrors = upload.error?.code === "VALIDATION_ERROR" && Array.isArray(upload.error.details)
    ? (upload.error.details as ImportRowError[]).filter((d) => typeof d.line === "number")
    : [];

  function openDialog() {
    setFile(null);
    setDone(null);
    upload.reset();
    setOpen(true);
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!file) return;
    const body: Record<string, string> = { csv: await file.text() };
    if (asOf) body.asOf = date;
    const result = await upload.mutate(body);
    if (result !== undefined) {
      setDone(summarise(result));
      router.refresh();
    }
  }

  return (
    <>
      <Button variant="secondary" onClick={openDialog}>
        <Upload aria-hidden /> Import CSV
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title={title} description={description} className="max-w-2xl">
        {done ? (
          <div className="space-y-4">
            <Alert tone="success">{done}</Alert>
            <div className="flex justify-end">
              <Button onClick={() => setOpen(false)}>Done</Button>
            </div>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4" noValidate>
            <a href={templateHref} download className="inline-flex items-center gap-1 text-sm text-brand-700 hover:underline">
              <Download className="size-4" aria-hidden /> Download the template
            </a>
            <Field label="CSV file" htmlFor={`${endpoint}-file`} required>
              <Input
                id={`${endpoint}-file`}
                type="file"
                accept=".csv,text/csv"
                className="h-auto py-1.5"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </Field>
            {asOf && (
              <Field label={asOf.label} htmlFor={`${endpoint}-date`} error={upload.fieldErrors.asOf} required>
                <Input id={`${endpoint}-date`} type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-44" />
              </Field>
            )}

            {upload.error && (
              <Alert tone="error" title={upload.error.message}>
                {rowErrors.length > 0 && (
                  <ul className="mt-2 max-h-60 space-y-1 overflow-y-auto">
                    {rowErrors.map((e) => (
                      <li key={`${e.line}-${e.message}`}>
                        <span className="font-mono">Line {e.line}:</span> {e.message}
                      </li>
                    ))}
                  </ul>
                )}
              </Alert>
            )}

            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" loading={upload.pending} disabled={!file}>
                Validate & import
              </Button>
            </div>
          </form>
        )}
      </Dialog>
    </>
  );
}
