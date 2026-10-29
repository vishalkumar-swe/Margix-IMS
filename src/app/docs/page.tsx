import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen, Clock, ArrowRight, Layers } from "lucide-react";
import { MASTER_MANUAL_INDEX, MANUAL_CHAPTERS } from "@/lib/manual-content";
import { DocMarkdown } from "@/features/docs/doc-markdown";

export const metadata: Metadata = {
  title: "Operational Manual & Delivery Handbook — Margix IMS",
  description: "End-to-end operational manual, system architecture, Indian GST compliance, universal barcode scanning, and onboarding runbook.",
};

export default function DocsIndexPage() {
  return (
    <article className="space-y-8">
      {/* Hero Badge */}
      <div className="border-b border-slate-200 pb-6">
        <div className="inline-flex items-center gap-2 rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700">
          <BookOpen className="size-3.5" />
          Production Release Operational Manual
        </div>
        <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">
          Margix IMS — Enterprise Handbook
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          Comprehensive, genuine, end-to-end operational manual covering all warehouse, inventory, statutory GST, Tally ERP integration, and barcode scanner capabilities.
        </p>
      </div>

      {/* Chapters Grid */}
      <div>
        <h2 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
          <Layers className="size-5 text-brand-600" />
          Explore the 12 Operational Chapters
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {MANUAL_CHAPTERS.map((c) => (
            <Link
              key={c.slug}
              href={`/docs/${c.slug}`}
              className="group flex flex-col justify-between rounded-xl border border-slate-200 p-4 transition-all hover:border-brand-300 hover:bg-brand-50/30 hover:shadow-xs"
            >
              <div>
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded bg-slate-100 px-2 py-0.5 font-mono text-[11px] font-bold text-slate-700">
                    Chapter {c.number}
                  </span>
                  <span className="flex items-center gap-1 text-[11px] text-slate-400">
                    <Clock className="size-3" />
                    {c.readingTime}
                  </span>
                </div>
                <h3 className="mt-2 text-sm font-semibold text-slate-900 group-hover:text-brand-700">
                  {c.title}
                </h3>
                <p className="mt-1 text-xs leading-relaxed text-slate-500 line-clamp-2">
                  {c.summary}
                </p>
              </div>

              <div className="mt-3 flex items-center gap-1 text-xs font-medium text-brand-600 group-hover:text-brand-800">
                <span>Read chapter</span>
                <ArrowRight className="size-3 transition-transform group-hover:translate-x-1" />
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* Master Manual Content Markdown */}
      <div className="border-t border-slate-200 pt-8">
        <DocMarkdown text={MASTER_MANUAL_INDEX} />
      </div>
    </article>
  );
}

