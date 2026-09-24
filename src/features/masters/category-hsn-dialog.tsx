"use client";

import { Pencil } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { apiRequest } from "@/lib/api-client";
import { HsnPicker } from "./hsn-picker";

/** Sets the HSN code suggested first for new products in a category. */
export function CategoryHsnDialog({ categoryId, name, hsnCode }: { categoryId: string; name: string; hsnCode: string | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState(hsnCode ?? "");
  const save = useApiMutation((value: string) =>
    apiRequest(`/categories/${categoryId}`, { method: "PATCH", body: { hsnCode: value } }),
  );

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (await save.mutate(code.trim())) {
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
          setCode(hsnCode ?? "");
          save.reset();
          setOpen(true);
        }}
        aria-label={`Set default HSN for ${name}`}
      >
        <Pencil aria-hidden /> HSN
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title={`Default HSN: ${name}`} description="New products in this category are offered this HSN code and its GST rate first.">
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          {save.error && !save.fieldErrors.hsnCode && <Alert tone="error">{save.error.message}</Alert>}
          <Field label="HSN code" htmlFor={`cat-${categoryId}-hsn`} error={save.fieldErrors.hsnCode} hint="Leave blank for no default.">
            <HsnPicker
              id={`cat-${categoryId}-hsn`}
              value={code}
              invalid={Boolean(save.fieldErrors.hsnCode)}
              product={{ name, description: "", categoryId: "" }}
              onChange={(choice) => setCode(choice.code)}
            />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={save.pending}>
              Save
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
