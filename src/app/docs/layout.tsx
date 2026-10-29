"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookOpen,
  Search,
  ArrowLeft,
  Menu,
  X,
  Printer,
  Compass,
  Layers,
  Sparkles,
  Barcode,
  Truck,
  ReceiptIndianRupee,
  ShieldCheck,
} from "lucide-react";
import { BrandLogo } from "@/components/layout/brand-logo";
import { MANUAL_CHAPTERS } from "@/lib/manual-content";
import { DocsSearchModal } from "@/features/docs/docs-search-modal";
import { ReadingProgress } from "@/features/docs/reading-progress";
import { cn } from "@/lib/cn";

interface CategoryGroup {
  name: string;
  icon: any;
  chapters: typeof MANUAL_CHAPTERS;
}

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [sidebarFilter, setSidebarFilter] = useState("");
  const [mobileOpen, setMobileOpen] = useState(false);

  // Group chapters into functional operational domains
  const categories: CategoryGroup[] = useMemo(() => {
    const q = sidebarFilter.trim().toLowerCase();
    const filterFn = (c: (typeof MANUAL_CHAPTERS)[0]) =>
      !q ||
      c.title.toLowerCase().includes(q) ||
      c.shortTitle.toLowerCase().includes(q) ||
      c.summary.toLowerCase().includes(q) ||
      c.category.toLowerCase().includes(q);

    const foundation = MANUAL_CHAPTERS.filter((c) => ["00", "01"].includes(c.number)).filter(filterFn);
    const scanning = MANUAL_CHAPTERS.filter((c) => ["02"].includes(c.number)).filter(filterFn);
    const logistics = MANUAL_CHAPTERS.filter((c) => ["03", "04", "05"].includes(c.number)).filter(filterFn);
    const statutory = MANUAL_CHAPTERS.filter((c) => ["06", "07", "08"].includes(c.number)).filter(filterFn);
    const intelligence = MANUAL_CHAPTERS.filter((c) => ["09", "10", "11"].includes(c.number)).filter(filterFn);

    const groups: CategoryGroup[] = [
      { name: "Platform Foundation", icon: Layers, chapters: foundation },
      { name: "Universal Scanning", icon: Barcode, chapters: scanning },
      { name: "Warehouse & Logistics", icon: Truck, chapters: logistics },
      { name: "Taxation, Reports & ERP", icon: ReceiptIndianRupee, chapters: statutory },
      { name: "Copilot AI & Runbooks", icon: Sparkles, chapters: intelligence },
    ];

    return groups.filter((g) => g.chapters.length > 0);
  }, [sidebarFilter]);

  return (
    <div className="min-h-screen bg-slate-50/60 text-slate-900 flex flex-col font-sans">
      {/* Top Reading Progress Bar */}
      <ReadingProgress />

      {/* Top Sticky Navbar */}
      <header className="sticky top-0 z-40 flex h-16 items-center justify-between border-b border-slate-200/80 bg-white/95 px-4 backdrop-blur-md sm:px-8 shadow-2xs">
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
          <span className="hidden items-center gap-1.5 text-xs font-bold tracking-wider text-brand-700 uppercase sm:inline-flex">
            <BookOpen className="size-4 text-brand-600" />
            Operations Manual
          </span>
        </div>

        {/* Global ⌘K Search Modal + Actions */}
        <div className="flex items-center gap-3">
          <DocsSearchModal />

          <button
            type="button"
            onClick={() => window.print()}
            className="hidden sm:inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors shadow-2xs print:hidden"
            title="Print this chapter or save as PDF"
          >
            <Printer className="size-3.5" />
            <span>Print / PDF</span>
          </button>

          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-brand-700 transition-colors"
          >
            <ArrowLeft className="size-3.5" />
            <span>Open Margix IMS</span>
          </Link>
        </div>
      </header>

      {/* Main Grid: Sticky Left Sidebar + Center Content + Sticky Right TOC */}
      <div className="mx-auto flex w-full max-w-[1440px] flex-1 items-start px-4 sm:px-6 lg:px-8">
        {/* Left Sidebar (Sticky on Desktop: DOES NOT SCROLL AWAY WITH PAGE) */}
        <aside
          className={cn(
            "fixed inset-y-16 left-0 z-30 w-72 transform border-r border-slate-200 bg-white p-4 transition-transform lg:sticky lg:top-16 lg:h-[calc(100vh-4rem)] lg:overflow-y-auto lg:w-64 xl:w-72 lg:shrink-0 lg:border-r lg:bg-transparent lg:p-0 lg:py-6 lg:pr-5",
            mobileOpen ? "translate-x-0 shadow-2xl" : "-translate-x-full lg:translate-x-0",
          )}
        >
          {/* Quick Filter Input */}
          <div className="relative mb-3">
            <Search className="absolute left-3 top-2.5 size-3.5 text-slate-400" />
            <input
              type="text"
              placeholder="Filter chapters..."
              value={sidebarFilter}
              onChange={(e) => setSidebarFilter(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white py-1.5 pl-8 pr-3 text-xs placeholder-slate-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>

          {/* Master Index Overview Link */}
          <div className="mb-4">
            <Link
              href="/docs"
              onClick={() => setMobileOpen(false)}
              className={cn(
                "flex items-center justify-between rounded-lg px-3 py-2 text-xs font-semibold transition-all",
                pathname === "/docs"
                  ? "bg-brand-50 text-brand-700 font-bold shadow-2xs border border-brand-200/50"
                  : "text-slate-700 hover:bg-slate-100/80",
              )}
            >
              <div className="flex items-center gap-2">
                <Compass className="size-4 text-brand-600" />
                <span>Handbook Overview</span>
              </div>
              <span className="rounded bg-brand-100/80 px-1.5 py-0.2 text-[10px] font-bold text-brand-800">
                12 Ch
              </span>
            </Link>
          </div>

          {/* Categorized Chapters Navigation */}
          <nav className="space-y-4 pr-1 text-xs">
            {categories.map((group) => {
              const GroupIcon = group.icon;
              return (
                <div key={group.name} className="space-y-1">
                  <div className="flex items-center gap-1.5 px-3 py-1 text-[11px] font-bold tracking-wider text-slate-400 uppercase">
                    <GroupIcon className="size-3 text-slate-400" />
                    <span>{group.name}</span>
                  </div>

                  <div className="space-y-0.5">
                    {group.chapters.map((c) => {
                      const active = pathname === `/docs/${c.slug}`;
                      return (
                        <Link
                          key={c.slug}
                          href={`/docs/${c.slug}`}
                          onClick={() => setMobileOpen(false)}
                          className={cn(
                            "flex items-center gap-2.5 rounded-lg px-3 py-1.5 transition-colors",
                            active
                              ? "bg-brand-50 text-brand-700 font-semibold shadow-2xs border border-brand-200/40"
                              : "text-slate-600 hover:bg-slate-100/80 hover:text-slate-900",
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
                  </div>
                </div>
              );
            })}

            {categories.length === 0 && (
              <p className="px-3 py-4 text-xs text-slate-400">No chapters matching filter</p>
            )}
          </nav>

          {/* Bottom Compliance & Release Tag */}
          <div className="mt-8 border-t border-slate-200/80 pt-4 px-3 text-[11px] text-slate-400 space-y-1">
            <div className="flex items-center gap-1 text-slate-600 font-medium">
              <ShieldCheck className="size-3.5 text-emerald-600" />
              <span>Production Release v1.0</span>
            </div>
            <p className="text-[10px] text-slate-400">Indian GST & Tally Prime Certified</p>
          </div>
        </aside>

        {/* Backdrop for Mobile Drawer */}
        {mobileOpen && (
          <div
            className="fixed inset-0 z-20 bg-slate-900/30 backdrop-blur-2xs lg:hidden"
            onClick={() => setMobileOpen(false)}
          />
        )}

        {/* Content Area (Constrained to optimal reading width so text is NOT congested or stretched) */}
        <main className="min-w-0 flex-1 py-6 lg:pl-8">{children}</main>
      </div>
    </div>
  );
}
