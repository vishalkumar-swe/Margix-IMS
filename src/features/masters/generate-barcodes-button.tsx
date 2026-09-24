"use client";

import { Barcode } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { apiRequest } from "@/lib/api-client";

/** Gives every product without a barcode a generated internal EAN-13. */
export function GenerateBarcodesButton() {
  const router = useRouter();
  const [result, setResult] = useState<string | null>(null);
  const generate = useApiMutation(() => apiRequest<{ count: number }>("/skus/barcodes", { method: "POST" }));

  return (
    <span className="flex items-center gap-2">
      {(result || generate.error) && (
        <span role="status" className={generate.error ? "text-xs text-red-600" : "text-xs text-slate-600"}>
          {generate.error?.message ?? result}
        </span>
      )}
      <Button
        variant="secondary"
        loading={generate.pending}
        title="Generate internal EAN-13 barcodes for products that have none"
        onClick={async () => {
          const done = await generate.mutate(undefined);
          if (done) {
            setResult(done.count === 0 ? "Every product already has a barcode." : `${done.count} barcodes generated.`);
            router.refresh();
          }
        }}
      >
        {!generate.pending && <Barcode aria-hidden />} Generate missing barcodes
      </Button>
    </span>
  );
}
