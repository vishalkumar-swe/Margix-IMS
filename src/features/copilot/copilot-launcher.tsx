"use client";

import { Sparkles, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/cn";
import { useCopilot } from "./copilot-provider";

/** Top navbar launcher button with milestone progress badge (PRD §7.1). */
export function CopilotLauncher({ className }: { className?: string }) {
  const { drawerOpen, toggleDrawer, progress, diagnostic } = useCopilot();

  return (
    <button
      type="button"
      onClick={toggleDrawer}
      aria-expanded={drawerOpen}
      aria-controls="copilot-drawer"
      className={cn(
        "flex items-center gap-1.5 rounded-lg border border-brand-300 bg-brand-50 px-2.5 py-1.5 text-xs font-semibold text-brand-950 shadow-xs transition-all hover:bg-brand-100 hover:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-500",
        drawerOpen && "bg-brand-100 border-brand-400 ring-2 ring-brand-500",
        className,
      )}
      title="Open AI Copilot & Market Research (Ctrl + J)"
    >
      <span className="relative grid size-5 place-items-center rounded-md bg-brand-500 text-slate-950">
        <Sparkles className="size-3" aria-hidden />
        {diagnostic && (
          <span className="absolute -top-1 -right-1 grid size-3 place-items-center rounded-full bg-red-600 text-[8px] font-bold text-white">
            !
          </span>
        )}
      </span>
      <span className="hidden sm:inline font-semibold">AI Copilot</span>
      <span className="rounded bg-brand-200/80 px-1 py-0.2 text-[10px] font-bold text-brand-900 tabular-nums">
        {progress.done}/{progress.total}
      </span>
      <kbd className="hidden lg:inline text-[9px] text-brand-700/80 font-mono bg-white/70 px-1 rounded border border-brand-200">
        Ctrl J
      </kbd>
    </button>
  );
}
