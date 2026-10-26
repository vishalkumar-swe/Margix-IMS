"use client";

import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

export default function AppError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <div className="glass rounded-xl border">
      <EmptyState
        icon={TriangleAlert}
        title="Something went wrong"
        description={`The page could not be loaded.${error.digest ? ` Reference: ${error.digest}` : ""}`}
        action={<Button onClick={retry}>Try again</Button>}
      />
    </div>
  );
}
