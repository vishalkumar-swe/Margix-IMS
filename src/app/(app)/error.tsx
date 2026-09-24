"use client";

import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white">
      <EmptyState
        icon={TriangleAlert}
        title="Something went wrong"
        description={`The page could not be loaded.${error.digest ? ` Reference: ${error.digest}` : ""}`}
        action={<Button onClick={reset}>Try again</Button>}
      />
    </div>
  );
}
