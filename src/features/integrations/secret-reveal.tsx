"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

/** Shows a webhook signing secret once, with a copy button. */
export function SecretReveal({ secret }: { secret: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Alert tone="info" title="Copy the signing secret now">
      <p>It is shown only this once. The receiving system uses it to verify the X-Margix-Signature header.</p>
      <div className="mt-2 flex items-center gap-2">
        <code className="surface-solid min-w-0 flex-1 truncate rounded border px-2 py-1 font-mono text-xs select-all">{secret}</code>
        <Button
          variant="secondary"
          size="sm"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(secret);
              setCopied(true);
            } catch {
              // Clipboard blocked (e.g. plain http); the text is selectable instead.
            }
          }}
        >
          {copied ? <Check aria-hidden /> : <Copy aria-hidden />} {copied ? "Copied" : "Copy"}
        </Button>
      </div>
    </Alert>
  );
}
