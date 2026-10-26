import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { buttonVariants } from "./button";

const linkClass = buttonVariants({ variant: "secondary", size: "sm" });

/** A disabled step renders as a plain span so it cannot be tabbed to or activated. */
function PageStep({ disabled, href, children }: { disabled: boolean; href: string; children: ReactNode }) {
  if (disabled) {
    return (
      <span aria-disabled="true" className={cn(linkClass, "pointer-events-none opacity-50")}>
        {children}
      </span>
    );
  }
  return (
    <Link href={href} className={linkClass}>
      {children}
    </Link>
  );
}

/**
 * Page navigation that preserves the current filters. `searchParams` is the
 * page's current query; only `page` is replaced.
 */
export function Pagination({
  page,
  pageSize,
  total,
  pathname,
  searchParams,
}: {
  page: number;
  pageSize: number;
  total: number;
  pathname: string;
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;

  const hrefFor = (target: number) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(searchParams)) {
      if (typeof value === "string" && key !== "page") params.set(key, value);
    }
    params.set("page", String(target));
    return `${pathname}?${params.toString()}`;
  };

  const first = (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);

  return (
    <nav className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-4 py-3 text-sm" aria-label="Pagination">
      <p className="text-slate-500">
        {first}–{last} of {total}
        <span className="ml-2 hidden text-slate-400 sm:inline">
          Page {page} of {pages}
        </span>
      </p>
      <div className="flex gap-2">
        <PageStep disabled={page <= 1} href={hrefFor(page - 1)}>
          <ChevronLeft aria-hidden /> Previous
        </PageStep>
        <PageStep disabled={page >= pages} href={hrefFor(page + 1)}>
          Next <ChevronRight aria-hidden />
        </PageStep>
      </div>
    </nav>
  );
}
