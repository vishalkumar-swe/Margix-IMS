"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, Search, ArrowLeft, Menu, X, Printer, Compass, FileText } from "lucide-react";
import { BrandLogo } from "@/components/layout/brand-logo";
import { MANUAL_CHAPTERS } from "@/lib/manual-content";
import { cn } from "@/lib/cn";

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [search, setSearch] = useState("");
  const [mobileOpen, setMobileOpen] = useState(false);

  const filteredChapters = MANUAL_CHAPTERS.filter(
    (c) =>
      c.title.toLowerCase().includes(search.toLowerCase()) ||
      c.shortTitle.toLowerCase().includes(search.toLowerCase()) ||
      c.summary.toLowerCase().includes(search.toLowerCase()) ||
      c.category.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      {/* Top Navbar */}
      <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-slate-200 bg-white/95 px-4 backdrop-blur sm:px-8">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => setMobileOpen(!mobileOpen)}
            className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden"
            aria-label="Toggle navigation"
          >
            {mobileOpen ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
          <Link href="/" className="flex items-center gap-2">
            <BrandLogo variant="wordmark" className="h-6" />
          </Link>
          <span className="hidden text-slate-300 sm:inline">|</span>
          <span className="hidden items-center gap-1.5 text-xs font-semibold tracking-wide text-brand-700 uppercase sm:inline-flex">
            <BookOpen className="size-4" />
            Operations Manual
          </span>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 print:hidden"
          >
            <Printer className="size-3.5" />
            <span className="hidden sm:inline">Print Chapter</span>
          </button>
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-brand-700"
          >
            <ArrowLeft className="size-3.5" />
            <span>Open Margix IMS</span>
          </Link>
        </div>
      </header>

      {/* Main Grid: Left Sidebar + Content */}
      <div className="mx-auto flex w-full max-w-7xl flex-1 items-start px-4 sm:px-6 lg:px-8">
        {/* Left Sidebar (Desktop + Mobile Drawer) */}
        <aside
          className={cn(
            "fixed inset-y-16 left-0 z-20 w-72 transform border-r border-slate-200 bg-white p-4 transition-transform lg:static lg:inset-auto lg:w-72 lg:translate-x-0 lg:border-r lg:bg-transparent lg:p-0 lg:py-6",
            mobileOpen ? "translate-x-0 shadow-xl" : "-translate-x-full lg:translate-x-0",
          )}
        >
          {/* Search Bar */}
          <div className="relative mb-4">
            <Search className="absolute left-3 top-2.5 size-4 text-slate-400" />
            <input
              type="text"
              placeholder="Filter chapters..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white py-1.5 pl-9 pr-3 text-xs placeholder-slate-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>

          {/* Master Index Link */}
          <div className="mb-3">
            <Link
              href="/docs"
              onClick={() => setMobileOpen(false)}
              className={cn(
                "flex items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-semibold transition-colors",
                pathname === "/docs"
                  ? "bg-brand-50 text-brand-700 font-bold"
                  : "text-slate-700 hover:bg-slate-100",
              )}
            >
              <Compass className="size-4 text-brand-600" />
              <span>Master Index & Overview</span>
            </Link>
          </div>

          <p className="px-3 text-[11px] font-semibold tracking-wider text-slate-400 uppercase">Handbook Chapters</p>

          <nav className="mt-2 space-y-1 overflow-y-auto max-h-[calc(100vh-14rem)] pr-1">
            {filteredChapters.map((c) => {
              const active = pathname === `/docs/${c.slug}`;
              return (
                <Link
                  key={c.slug}
                  href={`/docs/${c.slug}`}
                  onClick={() => setMobileOpen(false)}
                  className={cn(
                    "flex items-center gap-2.5 rounded-lg px-3 py-2 text-xs transition-colors",
                    active
                      ? "bg-brand-50 text-brand-700 font-semibold"
                      : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
                  )}
                >
                  <span
                    className={cn(
                      "grid size-5 shrink-0 place-items-center rounded text-[10px] font-bold",
                      active ? "bg-brand-600 text-white" : "bg-slate-200 text-slate-700",
                    )}
                  >
                    {c.number}
                  </span>
                  <span className="truncate">{c.shortTitle}</span>
                </Link>
              );
            })}
            {filteredChapters.length === 0 && (
              <p className="px-3 py-4 text-xs text-slate-400">No chapters matching &quot;{search}&quot;</p>
            )}
          </nav>
        </aside>

        {/* Content Area */}
        <main className="min-w-0 flex-1 py-6 lg:pl-8">
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs sm:p-10">{children}</div>
        </main>
      </div>
    </div>
  );
}

