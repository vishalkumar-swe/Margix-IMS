"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/form-controls";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { apiRequest } from "@/lib/api-client";
import type { LoginInput } from "@/lib/validation/auth";

export function LoginForm({ next }: { next: string }) {
  const router = useRouter();
  const [form, setForm] = useState<LoginInput>({ email: "", password: "" });
  const login = useApiMutation((input: LoginInput) => apiRequest("/auth/login", { body: input }));

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (await login.mutate(form)) {
      router.replace(next);
      router.refresh();
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {login.error && !Object.keys(login.fieldErrors).length && <Alert tone="error">{login.error.message}</Alert>}

      <Field label="Email" htmlFor="email" error={login.fieldErrors.email}>
        <Input
          id="email"
          type="email"
          autoComplete="username"
          autoFocus
          required
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          aria-invalid={Boolean(login.fieldErrors.email)}
        />
      </Field>

      <Field label="Password" htmlFor="password" error={login.fieldErrors.password}>
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
          required
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
          aria-invalid={Boolean(login.fieldErrors.password)}
        />
      </Field>

      <Button type="submit" className="w-full" loading={login.pending}>
        Sign in
      </Button>
    </form>
  );
}
