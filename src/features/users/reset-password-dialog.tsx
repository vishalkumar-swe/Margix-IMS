"use client";

import { KeyRound } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/form-controls";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { apiRequest } from "@/lib/api-client";

export function ResetPasswordDialog({ userId, userName }: { userId: string; userName: string }) {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [done, setDone] = useState(false);
  const reset = useApiMutation((body: { password: string }) =>
    apiRequest(`/users/${userId}/reset-password`, { body }),
  );

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if ((await reset.mutate({ password })) !== undefined) {
      setPassword("");
      setDone(true);
    }
  }

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => {
          setDone(false);
          setPassword("");
          reset.reset();
          setOpen(true);
        }}
      >
        <KeyRound aria-hidden /> Reset password
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={`Reset password for ${userName}`}
        description="The user is signed out everywhere and any lockout is cleared."
      >
        {done ? (
          <div className="space-y-4">
            <Alert tone="success">Password updated. Share the new password with the user securely.</Alert>
            <div className="flex justify-end">
              <Button onClick={() => setOpen(false)}>Done</Button>
            </div>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4" noValidate>
            {reset.error && !reset.fieldErrors.password && <Alert tone="error">{reset.error.message}</Alert>}
            <Field label="New password" htmlFor={`reset-${userId}`} error={reset.fieldErrors.password} required>
              <Input
                id={`reset-${userId}`}
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" loading={reset.pending}>
                Set password
              </Button>
            </div>
          </form>
        )}
      </Dialog>
    </>
  );
}
