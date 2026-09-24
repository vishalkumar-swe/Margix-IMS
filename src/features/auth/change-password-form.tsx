"use client";

import { useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/form-controls";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { apiRequest } from "@/lib/api-client";
import type { PasswordChangeInput } from "@/lib/validation/users";

const EMPTY: PasswordChangeInput = { currentPassword: "", newPassword: "" };

export function ChangePasswordForm() {
  const [form, setForm] = useState(EMPTY);
  const [confirm, setConfirm] = useState("");
  const [done, setDone] = useState(false);
  const [mismatch, setMismatch] = useState(false);
  const change = useApiMutation((body: PasswordChangeInput) => apiRequest("/auth/password", { body }));
  const errors = change.fieldErrors;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setDone(false);
    setMismatch(confirm !== form.newPassword);
    if (confirm !== form.newPassword) return;
    if ((await change.mutate(form)) !== undefined) {
      setForm(EMPTY);
      setConfirm("");
      setDone(true);
    }
  }

  return (
    <form onSubmit={onSubmit} className="max-w-md space-y-4" noValidate>
      {done && <Alert tone="success">Password changed. You have been signed out on your other devices.</Alert>}
      {change.error && !Object.keys(errors).length && <Alert tone="error">{change.error.message}</Alert>}
      <Field label="Current password" htmlFor="currentPassword" error={errors.currentPassword} required>
        <Input
          id="currentPassword"
          type="password"
          autoComplete="current-password"
          value={form.currentPassword}
          onChange={(e) => setForm({ ...form, currentPassword: e.target.value })}
        />
      </Field>
      <Field
        label="New password"
        htmlFor="newPassword"
        error={errors.newPassword}
        hint="At least 10 characters with letters and a digit."
        required
      >
        <Input
          id="newPassword"
          type="password"
          autoComplete="new-password"
          value={form.newPassword}
          onChange={(e) => setForm({ ...form, newPassword: e.target.value })}
        />
      </Field>
      <Field label="Confirm new password" htmlFor="confirmPassword" error={mismatch ? "Passwords do not match." : undefined} required>
        <Input
          id="confirmPassword"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
      </Field>
      <Button type="submit" loading={change.pending}>
        Change password
      </Button>
    </form>
  );
}
