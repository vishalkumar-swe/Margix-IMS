"use client";

import { Pencil, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input, Select } from "@/components/ui/form-controls";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { apiRequest } from "@/lib/api-client";
import { ROLE_LABELS } from "@/lib/permissions";
import { ROLE_CODES } from "@/lib/validation/users";

type RoleCode = (typeof ROLE_CODES)[number];

export interface UserFormValues {
  name: string;
  email: string;
  mobile: string;
  role: RoleCode;
  isActive: boolean;
}

export const EMPTY_USER: UserFormValues = { name: "", email: "", mobile: "", role: "WAREHOUSE_OPERATOR", isActive: true };

/** Create a user (with initial password) or edit profile, role and status. */
export function UserFormDialog({
  userId,
  initial,
  isSelf = false,
}: {
  userId?: string;
  initial: UserFormValues;
  isSelf?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(initial);
  const [password, setPassword] = useState("");
  const editing = Boolean(userId);

  const save = useApiMutation((values: UserFormValues) =>
    editing
      ? apiRequest(`/users/${userId}`, {
          method: "PATCH",
          body: { name: values.name, mobile: values.mobile, role: values.role, isActive: values.isActive },
        })
      : apiRequest("/users", {
          body: { name: values.name, email: values.email, mobile: values.mobile, role: values.role, password },
        }),
  );
  const errors = save.fieldErrors;
  const set = <K extends keyof UserFormValues>(key: K, value: UserFormValues[K]) => setForm({ ...form, [key]: value });
  const id = (field: string) => `${userId ?? "new"}-user-${field}`;

  function openDialog() {
    setForm(initial);
    setPassword("");
    save.reset();
    setOpen(true);
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (await save.mutate(form)) {
      setOpen(false);
      router.refresh();
    }
  }

  return (
    <>
      {editing ? (
        <Button variant="ghost" size="sm" onClick={openDialog}>
          <Pencil aria-hidden /> Edit
        </Button>
      ) : (
        <Button onClick={openDialog}>
          <Plus aria-hidden /> New user
        </Button>
      )}
      <Dialog open={open} onClose={() => setOpen(false)} title={editing ? `Edit ${initial.name}` : "New user"}>
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          {save.error && !Object.keys(errors).length && <Alert tone="error">{save.error.message}</Alert>}
          <Field label="Name" htmlFor={id("name")} error={errors.name} required>
            <Input id={id("name")} value={form.name} onChange={(e) => set("name", e.target.value)} />
          </Field>
          <Field label="Email (login)" htmlFor={id("email")} error={errors.email} required={!editing}>
            <Input
              id={id("email")}
              type="email"
              autoComplete="off"
              value={form.email}
              disabled={editing}
              onChange={(e) => set("email", e.target.value)}
            />
          </Field>
          <Field label="Mobile" htmlFor={id("mobile")} error={errors.mobile}>
            <Input id={id("mobile")} type="tel" value={form.mobile} onChange={(e) => set("mobile", e.target.value)} />
          </Field>
          <Field label="Role" htmlFor={id("role")} error={errors.role} required hint={isSelf ? "You cannot change your own role." : undefined}>
            <Select id={id("role")} value={form.role} disabled={isSelf} onChange={(e) => set("role", e.target.value as RoleCode)}>
              {ROLE_CODES.map((code) => (
                <option key={code} value={code}>
                  {ROLE_LABELS[code]}
                </option>
              ))}
            </Select>
          </Field>
          {!editing && (
            <Field
              label="Initial password"
              htmlFor={id("password")}
              error={errors.password}
              required
              hint="At least 10 characters with letters and a digit. Share it securely."
            >
              <Input
                id={id("password")}
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>
          )}
          {editing && !isSelf && (
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => set("isActive", e.target.checked)}
                className="size-4 rounded border-slate-300"
              />
              Active (deactivating signs the user out everywhere)
            </label>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={save.pending}>
              {editing ? "Save changes" : "Create user"}
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
