"use client";

import { ArrowRight, Check, Clock } from "lucide-react";
import Link from "next/link";
import type { ChecklistItem } from "@/lib/checklist";
import { cn } from "@/lib/cn";
import { ChecklistStatusBadge } from "./checklist-status-badge";

/** Compact list of checklist lines; tasks get a tick box, system items a link. */
export function ChecklistItems({
  items,
  onNavigate,
  onToggleTask,
  pendingTaskId,
}: {
  items: ChecklistItem[];
  onNavigate?: () => void;
  /** Omit to show tasks read-only. */
  onToggleTask?: (item: ChecklistItem, done: boolean) => void;
  pendingTaskId?: string | null;
}) {
  return (
    <ul className="divide-y divide-slate-100 rounded-md border border-slate-200">
      {items.map((item) => {
        const done = item.status === "COMPLETED";
        return (
          <li key={item.id} className="flex items-start gap-3 px-3 py-2.5">
            {item.kind === "task" && onToggleTask ? (
              <input
                type="checkbox"
                checked={done}
                disabled={pendingTaskId === item.taskId}
                onChange={(e) => onToggleTask(item, e.target.checked)}
                className="mt-0.5 size-4 shrink-0 rounded border-slate-300 accent-brand-500"
                aria-label={`Mark "${item.title}" ${done ? "not done" : "done"}`}
              />
            ) : (
              <span
                className={cn(
                  "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full",
                  done ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500",
                )}
                aria-hidden
              >
                {done ? <Check className="size-3" /> : <span className="size-1.5 rounded-full bg-current" />}
              </span>
            )}
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className={cn("text-sm font-medium", done ? "text-slate-500" : "text-slate-900")}>{item.title}</span>
                {item.count !== null && item.count > 0 && (
                  <span className="rounded bg-slate-100 px-1.5 text-xs font-semibold tabular-nums text-slate-700">{item.count}</span>
                )}
                {item.dueTime && (
                  <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                    <Clock className="size-3" aria-hidden /> by {item.dueTime}
                  </span>
                )}
              </div>
              {item.detail && <p className="mt-0.5 text-xs text-slate-500">{item.detail}</p>}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <ChecklistStatusBadge status={item.status} />
              {item.href && !done && (
                <Link
                  href={item.href}
                  onClick={onNavigate}
                  className="rounded p-1 text-brand-700 hover:bg-brand-50"
                  aria-label={`Open ${item.title}`}
                  title="Open"
                >
                  <ArrowRight className="size-4" aria-hidden />
                </Link>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
