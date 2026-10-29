"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

interface CodeBlockProps {
  code: string;
  language?: string;
}

export function CodeBlock({ code, language }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
    }
  };

  const cleanLang = language?.trim().toLowerCase() || "code";

  return (
    <div className="my-5 overflow-hidden rounded-xl border border-slate-700/60 bg-slate-900 shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-800 bg-slate-950 px-4 py-1.5">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] font-bold text-slate-400 uppercase tracking-wider">
            {cleanLang}
          </span>
        </div>

        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-[11px] font-medium text-slate-400 hover:bg-slate-800 hover:text-slate-200 transition-colors"
          title="Copy to clipboard"
        >
          {copied ? (
            <>
              <Check className="size-3 text-emerald-400" />
              <span className="text-emerald-400 font-semibold">Copied!</span>
            </>
          ) : (
            <>
              <Copy className="size-3" />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>

      <pre className="overflow-x-auto p-4 font-mono text-xs leading-relaxed text-slate-100">
        <code>{code}</code>
      </pre>
    </div>
  );
}
