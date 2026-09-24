"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/form-controls";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { apiRequest } from "@/lib/api-client";
import { ROLE_CODES, type NotificationAlertTypeCode } from "@/lib/enums";
import { ROLE_LABELS } from "@/lib/permissions";

export interface NotificationRuleValues {
  isEnabled: boolean;
  frequency: "IMMEDIATE" | "DAILY_DIGEST";
  digestTime: string;
  inAppEnabled: boolean;
  emailEnabled: boolean;
  whatsappEnabled: boolean;
  inAppRoles: string[];
  inAppUserIds: string[];
  emailRecipients: string[];
  whatsappRecipients: string[];
}

export interface RecipientUser {
  id: string;
  name: string;
  email: string;
  role: string;
}

const splitList = (text: string, separator: RegExp) =>
  text
    .split(separator)
    .map((v) => v.trim())
    .filter(Boolean);

/** Who is notified about one alert type, on which channels, and how often. */
export function NotificationRuleForm({
  alertType,
  initial,
  users,
  immediateHint,
}: {
  alertType: NotificationAlertTypeCode;
  initial: NotificationRuleValues;
  users: RecipientUser[];
  /** What "immediately" means for this alert type. */
  immediateHint: string;
}) {
  const router = useRouter();
  const [form, setForm] = useState(initial);
  const [emails, setEmails] = useState(initial.emailRecipients.join("\n"));
  const [phones, setPhones] = useState(initial.whatsappRecipients.map((p) => `+${p}`).join("\n"));
  const [saved, setSaved] = useState(false);
  const save = useApiMutation((body: NotificationRuleValues) =>
    apiRequest(`/notification-settings/rules/${alertType}`, { method: "PATCH", body }),
  );
  const errorFor = (field: string) =>
    Object.entries(save.fieldErrors).find(([path]) => path === field || path.startsWith(`${field}.`))?.[1];
  const id = (field: string) => `${alertType}-${field}`;
  const set = (patch: Partial<NotificationRuleValues>) => {
    setSaved(false);
    setForm({ ...form, ...patch });
  };
  const toggle = (list: string[], value: string, on: boolean) => (on ? [...list, value] : list.filter((v) => v !== value));

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const body = {
      ...form,
      emailRecipients: splitList(emails, /[\s,;]+/),
      whatsappRecipients: splitList(phones, /[\n,;]+/),
    };
    if (await save.mutate(body)) {
      setSaved(true);
      router.refresh();
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      {save.error && !Object.keys(save.fieldErrors).length && <Alert tone="error">{save.error.message}</Alert>}
      {saved && <Alert tone="success">Saved.</Alert>}

      <label className="flex items-center gap-2 text-sm font-medium text-slate-800">
        <input
          type="checkbox"
          checked={form.isEnabled}
          onChange={(e) => set({ isEnabled: e.target.checked })}
          className="size-4 rounded border-slate-300 accent-brand-500"
        />
        Send notifications for this alert type
      </label>

      <fieldset disabled={!form.isEnabled} className="space-y-5 disabled:opacity-60">
        <div className="grid gap-4 sm:grid-cols-2">
          <fieldset>
            <legend className="mb-1.5 text-sm font-medium text-slate-700">Frequency</legend>
            <div className="space-y-1.5 text-sm text-slate-700">
              <label className="flex items-start gap-2">
                <input
                  type="radio"
                  name={id("frequency")}
                  checked={form.frequency === "IMMEDIATE"}
                  onChange={() => set({ frequency: "IMMEDIATE" })}
                  className="mt-0.5 accent-brand-500"
                />
                <span>
                  Immediately <span className="block text-xs text-slate-500">{immediateHint}</span>
                </span>
              </label>
              <label className="flex items-start gap-2">
                <input
                  type="radio"
                  name={id("frequency")}
                  checked={form.frequency === "DAILY_DIGEST"}
                  onChange={() => set({ frequency: "DAILY_DIGEST" })}
                  className="mt-0.5 accent-brand-500"
                />
                <span>
                  Daily digest <span className="block text-xs text-slate-500">One summary of all active alerts each day.</span>
                </span>
              </label>
            </div>
          </fieldset>
          <Field
            label="Digest time (IST)"
            htmlFor={id("digestTime")}
            error={errorFor("digestTime")}
            hint={form.frequency === "DAILY_DIGEST" ? "Sent at or shortly after this time." : "Used for the daily digest."}
          >
            <Input
              id={id("digestTime")}
              type="time"
              value={form.digestTime}
              onChange={(e) => set({ digestTime: e.target.value })}
              className="w-32"
              disabled={form.frequency !== "DAILY_DIGEST"}
            />
          </Field>
        </div>

        <div className="grid gap-5 lg:grid-cols-3">
          <div className="space-y-2">
            <ChannelToggle label="In-app (bell)" checked={form.inAppEnabled} onChange={(v) => set({ inAppEnabled: v })} />
            <fieldset disabled={!form.inAppEnabled} className="space-y-2 disabled:opacity-60">
              <legend className="text-xs font-medium text-slate-500 uppercase">Roles</legend>
              <div className="grid grid-cols-1 gap-1 text-sm text-slate-700">
                {ROLE_CODES.map((role) => (
                  <label key={role} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={form.inAppRoles.includes(role)}
                      onChange={(e) => set({ inAppRoles: toggle(form.inAppRoles, role, e.target.checked) })}
                      className="size-4 rounded border-slate-300 accent-brand-500"
                    />
                    {ROLE_LABELS[role]}
                  </label>
                ))}
              </div>
              <p className="pt-1 text-xs font-medium text-slate-500 uppercase">And these users</p>
              <div className="max-h-36 space-y-1 overflow-y-auto rounded-md border border-slate-200 p-2 text-sm text-slate-700">
                {users.map((user) => (
                  <label key={user.id} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={form.inAppUserIds.includes(user.id)}
                      onChange={(e) => set({ inAppUserIds: toggle(form.inAppUserIds, user.id, e.target.checked) })}
                      className="size-4 rounded border-slate-300 accent-brand-500"
                    />
                    <span className="truncate" title={user.email}>
                      {user.name}
                    </span>
                  </label>
                ))}
              </div>
              {errorFor("inAppRoles") && <p className="text-xs text-red-600">{errorFor("inAppRoles")}</p>}
              {errorFor("inAppUserIds") && <p className="text-xs text-red-600">{errorFor("inAppUserIds")}</p>}
            </fieldset>
          </div>

          <div className="space-y-2">
            <ChannelToggle label="E-mail" checked={form.emailEnabled} onChange={(v) => set({ emailEnabled: v })} />
            <Field label="E-mail addresses" htmlFor={id("emails")} error={errorFor("emailRecipients")} hint="One per line or comma-separated.">
              <Textarea
                id={id("emails")}
                value={emails}
                onChange={(e) => {
                  setSaved(false);
                  setEmails(e.target.value);
                }}
                disabled={!form.emailEnabled}
                rows={4}
                placeholder="purchase@example.com"
              />
            </Field>
          </div>

          <div className="space-y-2">
            <ChannelToggle label="WhatsApp" checked={form.whatsappEnabled} onChange={(v) => set({ whatsappEnabled: v })} />
            <Field
              label="WhatsApp numbers"
              htmlFor={id("phones")}
              error={errorFor("whatsappRecipients")}
              hint="With country code, one per line, e.g. +91 98765 43210."
            >
              <Textarea
                id={id("phones")}
                value={phones}
                onChange={(e) => {
                  setSaved(false);
                  setPhones(e.target.value);
                }}
                disabled={!form.whatsappEnabled}
                rows={4}
                placeholder="+91 98765 43210"
              />
            </Field>
          </div>
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

function ChannelToggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-sm font-semibold text-slate-800">
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
