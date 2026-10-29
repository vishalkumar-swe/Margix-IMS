"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BookOpen, ChevronRight, FileText, Hash, Search, Tag, X } from "lucide-react";
import { MANUAL_CHAPTERS } from "@/lib/manual-content";
import { slugifyHeading } from "./doc-utils";
import { cn } from "@/lib/cn";

interface SearchResult {
  id: string;
  chapterSlug: string;
  chapterNumber: string;
  chapterShortTitle: string;
  category: string;
  sectionTitle?: string;
  sectionId?: string;
  snippet: string;
}

export function DocsSearchModal() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Shortcut listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Pre-build searchable items index
  const index = useMemo(() => {
    const items: SearchResult[] = [];

    for (const chapter of MANUAL_CHAPTERS) {
      // 1. Chapter root
      items.push({
        id: `chapter-${chapter.slug}`,
        chapterSlug: chapter.slug,
        chapterNumber: chapter.number,
        chapterShortTitle: chapter.shortTitle,
        category: chapter.category,
        snippet: chapter.summary,
      });

      // 2. Sections
      const lines = chapter.content.split("\n");
      let currentSection = "";
      let currentSectionId = "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith("## ") || trimmed.startsWith("### ")) {
          const raw = trimmed.replace(/^###?\s+/, "").replace(/\*\*/g, "").replace(/`/g, "");
          currentSection = raw;
          currentSectionId = slugifyHeading(raw);

          items.push({
            id: `sec-${chapter.slug}-${currentSectionId}`,
            chapterSlug: chapter.slug,
            chapterNumber: chapter.number,
            chapterShortTitle: chapter.shortTitle,
            category: chapter.category,
            sectionTitle: currentSection,
            sectionId: currentSectionId,
            snippet: `Section in Chapter ${chapter.number}: ${chapter.title}`,
          });
        }
      }
    }

    return items;
  }, []);

  // Filtered results
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return index.slice(0, 10); // initial popular chapters

    return index
      .filter((item) => {
        return (
          item.chapterShortTitle.toLowerCase().includes(q) ||
          item.category.toLowerCase().includes(q) ||
          item.sectionTitle?.toLowerCase().includes(q) ||
          item.snippet.toLowerCase().includes(q)
        );
      })
      .slice(0, 12);
  }, [query, index]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [results]);

  const handleNavigate = (item: SearchResult) => {
    setOpen(false);
    const href = item.sectionId
      ? `/docs/${item.chapterSlug}#${item.sectionId}`
      : `/docs/${item.chapterSlug}`;
    router.push(href);
  };

  const handleKeyDownInInput = (e: React.KeyboardEvent) => {
    if (results.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % results.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + results.length) % results.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const target = results[selectedIndex];
      if (target) handleNavigate(target);
    }
  };

  return (
    <>
      {/* Trigger Button in Header */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-1.5 text-xs text-slate-500 hover:border-slate-300 hover:bg-slate-100 transition-colors w-48 sm:w-64"
      >
        <span className="flex items-center gap-2">
          <Search className="size-3.5 text-slate-400" />
          <span className="truncate">Search manual & docs...</span>
        </span>
        <kbd className="hidden sm:inline-flex items-center gap-0.5 rounded border border-slate-200 bg-white px-1.5 font-mono text-[10px] text-slate-500 shadow-2xs">
          ⌘K
        </kbd>
      </button>

      {/* Modal Dialog */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 sm:p-6 md:p-20">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity"
            onClick={() => setOpen(false)}
          />

          {/* Dialog Panel */}
          <div className="relative w-full max-w-2xl transform overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl transition-all">
            {/* Search Input */}
            <div className="relative border-b border-slate-100 px-4 py-3 sm:px-6">
              <Search className="absolute left-6 top-4 size-5 text-slate-400" />
              <input
                type="text"
                autoFocus
                placeholder="Search by topic, barcode, GST rule, Tally voucher, or chapter..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDownInInput}
                className="w-full bg-transparent pl-9 pr-8 text-sm text-slate-900 placeholder-slate-400 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="absolute right-4 top-3.5 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <X className="size-4" />
              </button>
            </div>

            {/* Results List */}
            <div className="max-h-96 overflow-y-auto p-2 sm:p-3">
              {results.length > 0 ? (
                <div className="space-y-1">
                  {results.map((item, idx) => {
                    const isSelected = selectedIndex === idx;
                    const href = item.sectionId
                      ? `/docs/${item.chapterSlug}#${item.sectionId}`
                      : `/docs/${item.chapterSlug}`;

                    return (
                      <Link
                        key={item.id}
                        href={href}
                        onClick={() => setOpen(false)}
                        onMouseEnter={() => setSelectedIndex(idx)}
                        className={cn(
                          "flex items-start gap-3 rounded-xl p-3 transition-colors text-left",
                          isSelected
                            ? "bg-brand-50/80 text-brand-900 ring-1 ring-brand-300"
                            : "hover:bg-slate-50 text-slate-700",
                        )}
                      >
                        <span
                          className={cn(
                            "grid size-7 shrink-0 place-items-center rounded-lg text-xs font-bold mt-0.5",
                            item.sectionTitle
                              ? "bg-slate-100 text-slate-600"
                              : "bg-brand-600 text-white",
                          )}
                        >
                          {item.sectionTitle ? <Hash className="size-3.5" /> : item.chapterNumber}
                        </span>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-slate-900">
                              {item.sectionTitle || item.chapterShortTitle}
                            </span>
                            <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-1.5 py-0.2 font-mono text-[10px] text-slate-500">
                              {item.category}
                            </span>
                          </div>

                          <p className="mt-0.5 text-xs text-slate-500 line-clamp-1">
                            {item.sectionTitle
                              ? `Ch ${item.chapterNumber}: ${item.chapterShortTitle}`
                              : item.snippet}
                          </p>
                        </div>

                        <ChevronRight className="size-4 text-slate-300 self-center shrink-0" />
                      </Link>
                    );
                  })}
                </div>
              ) : (
                <div className="py-12 text-center text-sm text-slate-500">
                  <p>No documentation results matching &quot;{query}&quot;</p>
                  <p className="mt-1 text-xs text-slate-400">
                    Try searching for &quot;barcode&quot;, &quot;GST&quot;, &quot;Tally&quot;, or &quot;GRN&quot;
                  </p>
                </div>
              )}
            </div>

            {/* Footer Navigation Hints */}
            <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50 px-4 py-2 text-[11px] text-slate-400">
              <div className="flex items-center gap-3">
                <span>
                  <kbd className="rounded border bg-white px-1 py-0.5 font-mono text-[10px]">↑</kbd>{" "}
                  <kbd className="rounded border bg-white px-1 py-0.5 font-mono text-[10px]">↓</kbd> to
                  navigate
                </span>
                <span>
                  <kbd className="rounded border bg-white px-1 py-0.5 font-mono text-[10px]">↵</kbd> to
                  select
                </span>
                <span>
                  <kbd className="rounded border bg-white px-1 py-0.5 font-mono text-[10px]">esc</kbd> to
                  close
                </span>
              </div>
              <span className="font-medium text-brand-600">Margix Search Engine</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
