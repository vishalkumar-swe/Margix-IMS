"use client";

import { useEffect, useState } from "react";
import { ArrowUp, ListFilter } from "lucide-react";
import type { TocItem } from "./doc-utils";
import { cn } from "@/lib/cn";

interface TableOfContentsProps {
  items: TocItem[];
}

export function TableOfContents({ items }: TableOfContentsProps) {
  const [activeId, setActiveId] = useState<string>("");

  useEffect(() => {
    if (items.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        // Find visible headings
        const visibleEntries = entries.filter((entry) => entry.isIntersecting);
        if (visibleEntries.length > 0) {
          // Sort by top offset to pick topmost
          const topEntry = visibleEntries.sort(
            (a, b) => a.boundingClientRect.top - b.boundingClientRect.top,
          )[0];
          setActiveId(topEntry.target.id);
        }
      },
      {
        rootMargin: "-80px 0% -60% 0%",
        threshold: 0.1,
      },
    );

    items.forEach((item) => {
      const el = document.getElementById(item.id);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, [items]);

  if (items.length === 0) return null;

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <aside className="hidden xl:block w-64 shrink-0 pl-8">
      <div className="sticky top-24 space-y-4">
        <div className="flex items-center gap-1.5 text-xs font-semibold tracking-wider text-slate-400 uppercase">
          <ListFilter className="size-3.5 text-brand-600" />
          <span>On this page</span>
        </div>

        <nav className="max-h-[calc(100vh-14rem)] overflow-y-auto space-y-1 pr-2 text-xs">
          {items.map((item) => {
            const isActive = activeId === item.id;
            return (
              <a
                key={item.id}
                href={`#${item.id}`}
                className={cn(
                  "block py-1 transition-colors leading-snug rounded px-2",
                  item.level === 3 ? "pl-4 text-[11px]" : "font-medium",
                  isActive
                    ? "bg-brand-50 text-brand-700 font-semibold"
                    : "text-slate-500 hover:text-slate-900 hover:bg-slate-100/60",
                )}
              >
                {item.title}
              </a>
            );
          })}
        </nav>

        <div className="border-t border-slate-100 pt-3">
          <button
            type="button"
            onClick={scrollToTop}
            className="flex items-center gap-1.5 text-[11px] font-medium text-slate-400 hover:text-slate-700 transition-colors"
          >
            <ArrowUp className="size-3" />
            <span>Back to top</span>
          </button>
        </div>
      </div>
    </aside>
  );
}
