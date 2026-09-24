"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { apiRequest } from "@/lib/api-client";
import { CHECKLIST_SYSTEM_ITEMS, type ChecklistSystemItemKey } from "@/lib/checklist";

export interface ChecklistSettingsValues {
  disabledItems: ChecklistSystemItemKey[];
  showOnLogin: boolean;
  confirmOnLogout: boolean;
}

/** Which system items appear on everyone's checklist, and the login / logout behaviour. */
export function ChecklistSettingsForm({ initial }: { initial: ChecklistSettingsValues }) {
  const router = useRouter();
  const [form, setForm] = useState(initial);
  const [saved, setSaved] = useState(false);
  const save = useApiMutation((body: ChecklistSettingsValues) => apiRequest("/checklist-settings", { method: "PATCH", body }));
  const set = (patch: Partial<ChecklistSettingsValues>) => {
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
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      {save.error && <Alert tone="error">{save.error.message}</Alert>}
      {saved && <Alert tone="success">Saved.</Alert>}
      <div className="space-y-2">
        <Toggle
          label="Open the checklist on the first sign-in of the day"
          checked={form.showOnLogin}
          onChange={(v) => set({ showOnLogin: v })}
        />
        <Toggle
          label="Before signing out, list items still pending, overdue or critical"
          checked={form.confirmOnLogout}
          onChange={(v) => set({ confirmOnLogout: v })}
        />
      </div>
      <fieldset>
        <legend className="mb-2 text-sm font-medium text-slate-700">System items</legend>
        <p className="mb-3 text-xs text-slate-500">
          Computed from live data. Each user sees only the items their role can open.
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          {CHECKLIST_SYSTEM_ITEMS.map((item) => {
            const enabled = !form.disabledItems.includes(item.key);
            return (
              <label key={item.key} className="flex items-start gap-2 rounded-md border border-slate-200 p-3 text-sm">
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={(e) =>
                    set({
                      disabledItems: e.target.checked
                        ? form.disabledItems.filter((k) => k !== item.key)
                        : [...form.disabledItems, item.key],
                    })
                  }
                  className="mt-0.5 size-4 rounded border-slate-300 accent-brand-500"
                />
                <span>
                  <span className="block font-medium text-slate-800">{item.label}</span>
                  <span className="block text-xs text-slate-500">{item.description}</span>
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>
      <div className="flex justify-end">
        <Button type="submit" loading={save.pending}>
          Save
        </Button>
      </div>
    </form>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-sm text-slate-800">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="size-4 rounded border-slate-300 accent-brand-500"
      />
      {label}
    </label>
  );
}
