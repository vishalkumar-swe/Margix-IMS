"use client";

import { Sparkles, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/cn";
import { useCopilot } from "./copilot-provider";

/** Floating launcher pill with milestone progress (PRD §7.1). */
export function CopilotLauncher() {
  const { drawerOpen, toggleDrawer, progress, diagnostic } = useCopilot();

  return (
    <button
      type="button"
      onClick={toggleDrawer}
      aria-expanded={drawerOpen}
      aria-controls="copilot-drawer"
      className={cn(
        "fixed right-4 bottom-20 z-40 flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-800 shadow-lg transition-all hover:-translate-y-0.5 hover:shadow-xl lg:bottom-4",
        drawerOpen && "pointer-events-none opacity-0",
      )}
    >
      <span className="relative grid size-7 place-items-center rounded-full bg-brand-500 text-black">
        <Sparkles className="size-4" aria-hidden />
        {diagnostic && (
          <span className="absolute -top-0.5 -right-0.5 grid size-4 place-items-center rounded-full bg-red-600 text-white">
            <TriangleAlert className="size-2.5" aria-hidden />
          </span>
        )}
      </span>
      <span className="hidden sm:inline">AI Copilot</span>
      <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-slate-600 tabular-nums">
        {progress.done}/{progress.total}
      </span>
      <kbd className="hidden rounded border border-slate-200 bg-slate-50 px-1 font-mono text-[10px] text-slate-500 sm:inline">
        Ctrl J
      </kbd>
    </button>
  );
}
