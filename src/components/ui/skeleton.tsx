import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

/** Neutral placeholder block used by the route-level loading states. */
export function Skeleton({ className, ...props }: ComponentProps<"div">) {
  return <div aria-hidden className={cn("animate-pulse rounded-md bg-slate-500/10", className)} {...props} />;
}

/** Mirrors `PageHeader`: title, optional description, optional action buttons. */
export function PageHeaderSkeleton({ actions = 2 }: { actions?: number }) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div className="space-y-2">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-4 w-72" />
      </div>
      {actions > 0 && (
        <div className="flex gap-2">
          {Array.from({ length: actions }).map((_, index) => (
            <Skeleton key={index} className="h-9 w-28" />
          ))}
        </div>
      )}
    </div>
  );
}

/** Mirrors a card of tabular data. */
export function TableSkeleton({ rows = 8, columns = 5, title = true }: { rows?: number; columns?: number; title?: boolean }) {
  return (
    <div className="glass overflow-hidden rounded-xl border">
      {title && (
        <div className="space-y-2 border-b border-slate-200 px-5 py-4">
          <Skeleton className="h-4 w-40" />
        </div>
      )}
      <div className="divide-y divide-slate-100">
        {Array.from({ length: rows }).map((_, row) => (
          <div key={row} className="flex items-center gap-4 px-5 py-3.5">
            {Array.from({ length: columns }).map((_, column) => (
              <Skeleton key={column} className={cn("h-4", column === 0 ? "w-1/4" : "flex-1")} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Mirrors a row of `StatCard`s. */
export function StatCardsSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="glass space-y-3 rounded-xl border px-5 py-4">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-7 w-32" />
        </div>
      ))}
    </div>
  );
}
