import { Info } from "lucide-react";

/** Small "i" that explains how a figure is defined (native tooltip + screen-reader text). */
export function InfoHint({ text }: { text: string }) {
  return (
    <span className="inline-flex cursor-help text-slate-400 hover:text-slate-600" title={text} tabIndex={0}>
      <Info className="size-3.5" aria-hidden />
      <span className="sr-only">{text}</span>
    </span>
  );
}
