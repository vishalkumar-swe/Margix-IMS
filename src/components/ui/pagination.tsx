import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { buttonVariants } from "./button";

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
    <nav className="flex items-center justify-between border-t border-slate-200 px-4 py-3 text-sm" aria-label="Pagination">
      <p className="text-slate-500">
        {first}–{last} of {total}
      </p>
      <div className="flex gap-2">
        <Link
          href={hrefFor(page - 1)}
          aria-disabled={page <= 1}
          className={cn(buttonVariants({ variant: "secondary", size: "sm" }), page <= 1 && "pointer-events-none opacity-50")}
        >
          <ChevronLeft aria-hidden /> Previous
        </Link>
        <Link
          href={hrefFor(page + 1)}
          aria-disabled={page >= pages}
          className={cn(
            buttonVariants({ variant: "secondary", size: "sm" }),
            page >= pages && "pointer-events-none opacity-50",
          )}
        >
          Next <ChevronRight aria-hidden />
        </Link>
      </div>
    </nav>
  );
}
