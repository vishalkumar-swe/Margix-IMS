"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { apiRequest } from "@/lib/api-client";

export function CategoryToggleButton({ categoryId, isActive }: { categoryId: string; isActive: boolean }) {
  const router = useRouter();
  const toggle = useApiMutation(() =>
    apiRequest(`/categories/${categoryId}`, { method: "PATCH", body: { isActive: !isActive } }),
  );

  return (
    <Button
      variant="ghost"
      size="sm"
      loading={toggle.pending}
      title={toggle.error?.message}
      onClick={async () => {
        if (await toggle.mutate(undefined)) router.refresh();
      }}
    >
      {isActive ? "Deactivate" : "Activate"}
    </Button>
  );
}
