"use client";

import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Sign-in is the front door: a crash there must still look like the product. */
export default function AuthError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <main className="app-backdrop flex min-h-screen items-center justify-center px-4 text-slate-900">
      <div className="glass w-full max-w-sm rounded-xl border p-6 text-center">
        <div className="mx-auto flex size-10 items-center justify-center rounded-full bg-amber-100">
          <TriangleAlert className="size-5 text-amber-700" aria-hidden />
        </div>
        <h1 className="mt-4 text-base font-semibold">Something went wrong</h1>
        <p className="mt-1 text-sm text-slate-500">
          The sign-in screen could not be loaded.
          {error.digest ? ` Reference: ${error.digest}` : ""}
        </p>
        <Button className="mt-5 w-full" onClick={() => retry()}>
          Try again
        </Button>
      </div>
    </main>
  );
}
