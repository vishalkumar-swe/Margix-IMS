"use client";

import { Pencil, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/form-controls";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { apiRequest } from "@/lib/api-client";
import { ALL_WEBHOOK_EVENTS, WEBHOOK_EVENTS } from "@/lib/webhook-events";
import { SecretReveal } from "./secret-reveal";

export interface WebhookEndpointValues {
  id?: string;
  name: string;
  url: string;
  events: string[];
}

const GROUPS = [...new Set(WEBHOOK_EVENTS.map((e) => e.group))];

/** Add or edit a webhook endpoint. After adding, the signing secret is shown once. */
export function WebhookEndpointDialog({ initial }: { initial?: WebhookEndpointValues }) {
  const router = useRouter();
  const editing = Boolean(initial?.id);
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<WebhookEndpointValues>(initial ?? { name: "", url: "", events: [ALL_WEBHOOK_EVENTS] });
  const [secret, setSecret] = useState<string | null>(null);
  const save = useApiMutation((body: WebhookEndpointValues) =>
    editing
      ? apiRequest(`/integrations/webhooks/${initial!.id}`, { method: "PATCH", body })
      : apiRequest<{ secret: string }>("/integrations/webhooks", { body }),
  );
  const allEvents = values.events.includes(ALL_WEBHOOK_EVENTS);

  function toggle(event: string, checked: boolean) {
    setValues((v) => {
      const current = v.events.filter((e) => e !== ALL_WEBHOOK_EVENTS);
      return { ...v, events: checked ? [...current, event] : current.filter((e) => e !== event) };
    });
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const result = await save.mutate({ name: values.name, url: values.url, events: values.events });
    if (!result) return;
    router.refresh();
    if (!editing && "secret" in (result as object)) setSecret((result as { secret: string }).secret);
    else setOpen(false);
  }

  return (
    <>
      <Button
        variant={editing ? "ghost" : "primary"}
        size="sm"
        onClick={() => {
          setValues(initial ?? { name: "", url: "", events: [ALL_WEBHOOK_EVENTS] });
          setSecret(null);
          save.reset();
          setOpen(true);
        }}
      >
        {editing ? <Pencil aria-hidden /> : <Plus aria-hidden />} {editing ? "Edit" : "Add webhook"}
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? `Edit webhook “${initial!.name}”` : "Add a webhook"}
        description="Margix POSTs a signed JSON event to this URL whenever a chosen event happens."
        className="max-w-2xl"
      >
        {secret ? (
          <div className="space-y-4">
            <SecretReveal secret={secret} />
            <div className="flex justify-end">
              <Button onClick={() => setOpen(false)}>Done</Button>
            </div>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4" noValidate>
            {save.error && Object.keys(save.fieldErrors).length === 0 && <Alert tone="error">{save.error.message}</Alert>}
            <Field label="Name" htmlFor="webhook-name" error={save.fieldErrors.name} required>
              <Input
                id="webhook-name"
                value={values.name}
                onChange={(e) => setValues({ ...values, name: e.target.value })}
                placeholder="e.g. Accounts dashboard"
              />
            </Field>
            <Field
              label="Endpoint URL"
              htmlFor="webhook-url"
              error={save.fieldErrors.url}
              hint="A public https:// address that accepts POST requests."
              required
            >
              <Input
                id="webhook-url"
                type="url"
                inputMode="url"
                value={values.url}
                onChange={(e) => setValues({ ...values, url: e.target.value })}
                placeholder="https://example.com/hooks/margix"
              />
            </Field>
            <fieldset className="space-y-3">
              <legend className="text-sm font-medium text-slate-900">Events</legend>
              {save.fieldErrors.events && <p className="text-xs text-red-700">{save.fieldErrors.events}</p>}
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={allEvents}
                  onChange={(e) => setValues({ ...values, events: e.target.checked ? [ALL_WEBHOOK_EVENTS] : [] })}
                />
                <span className="font-medium">All events</span>
                <span className="text-slate-500">— including events added in future versions</span>
              </label>
              {!allEvents && (
                <div className="grid gap-4 sm:grid-cols-2">
                  {GROUPS.map((group) => (
                    <div key={group}>
                      <p className="mb-1 text-xs font-semibold tracking-wide text-slate-500 uppercase">{group}</p>
                      <ul className="space-y-1">
                        {WEBHOOK_EVENTS.filter((e) => e.group === group).map((e) => (
                          <li key={e.name}>
                            <label className="flex items-start gap-2 text-sm" title={e.description}>
                              <input
                                type="checkbox"
                                className="mt-1"
                                checked={values.events.includes(e.name)}
                                onChange={(ev) => toggle(e.name, ev.target.checked)}
                              />
                              <span>
                                <span className="font-mono text-xs">{e.name}</span>
                                <span className="block text-xs text-slate-500">{e.description}</span>
                              </span>
                            </label>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </fieldset>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" loading={save.pending}>
                {editing ? "Save changes" : "Add webhook"}
              </Button>
            </div>
          </form>
        )}
      </Dialog>
    </>
  );
}
