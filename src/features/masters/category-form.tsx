"use client";

import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/form-controls";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { apiRequest } from "@/lib/api-client";

export function CategoryForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const create = useApiMutation((body: { name: string }) => apiRequest("/categories", { body }));

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (await create.mutate({ name })) {
      setName("");
      router.refresh();
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-start gap-2" noValidate>
      <div className="min-w-48 flex-1">
        <Input aria-label="New category name" placeholder="New category" value={name} onChange={(e) => setName(e.target.value)} />
        {create.error && <p className="mt-1 text-xs text-red-600">{create.fieldErrors.name ?? create.error.message}</p>}
      </div>
      <Button type="submit" variant="secondary" loading={create.pending}>
        <Plus aria-hidden /> Add
      </Button>
    </form>
  );
}
