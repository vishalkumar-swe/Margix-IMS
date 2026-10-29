import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Clock,
  Tag,
  ChevronRight,
  ExternalLink,
  Sparkles,
  Zap,
  Users,
  CheckCircle2,
  Workflow,
  Compass,
} from "lucide-react";
import { MANUAL_CHAPTERS, getChapterBySlug } from "@/lib/manual-content";
import { DocMarkdown } from "@/features/docs/doc-markdown";
import { TableOfContents } from "@/features/docs/table-of-contents";
import { extractToc } from "@/features/docs/doc-utils";

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  return MANUAL_CHAPTERS.map((c) => ({ slug: c.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const chapter = getChapterBySlug(slug);
  if (!chapter) return { title: "Documentation Chapter Not Found — Margix IMS" };

  return {
    title: `Chapter ${chapter.number}: ${chapter.title} — Margix IMS Manual`,
    description: chapter.summary,
  };
}

export default async function DocChapterPage({ params }: Props) {
  const { slug } = await params;
  const chapter = getChapterBySlug(slug);

  if (!chapter) {
    notFound();
  }

  const toc = extractToc(chapter.content);

  const currentIndex = MANUAL_CHAPTERS.findIndex((c) => c.slug === chapter.slug);
  const prevChapter = currentIndex > 0 ? MANUAL_CHAPTERS[currentIndex - 1] : null;
  const nextChapter = currentIndex < MANUAL_CHAPTERS.length - 1 ? MANUAL_CHAPTERS[currentIndex + 1] : null;

  return (
    <div className="flex items-start justify-center gap-8">
      {/* Chapter Center Reading Card (Max width 820px: prevents line stretch & congestion!) */}
      <article className="min-w-0 flex-1 max-w-[820px] rounded-2xl border border-slate-200/80 bg-white p-6 shadow-xs sm:p-10">
        {/* Breadcrumbs */}
        <nav className="mb-6 flex items-center gap-1.5 text-xs text-slate-400">
          <Link href="/docs" className="hover:text-slate-700 transition-colors">
            Documentation
          </Link>
          <ChevronRight className="size-3 text-slate-300" />
          <span className="text-slate-600 font-medium">{chapter.category}</span>
          <ChevronRight className="size-3 text-slate-300" />
          <span className="text-brand-700 font-semibold truncate max-w-xs">
            Chapter {chapter.number}
          </span>
        </nav>

        {/* Chapter Header */}
        <header className="border-b border-slate-100 pb-6 mb-8">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-md bg-brand-600 px-2.5 py-1 font-mono text-xs font-bold text-white shadow-2xs">
              Chapter {chapter.number}
            </span>
            <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
              <Tag className="size-3" />
              {chapter.category}
            </span>
            <span className="flex items-center gap-1 text-xs text-slate-400 ml-auto">
              <Clock className="size-3.5 text-slate-400" />
              {chapter.readingTime} read
            </span>
          </div>

          <h1 className="mt-4 text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl lg:text-4xl">
            {chapter.title}
          </h1>

          {chapter.summary && (
            <p className="mt-3 text-sm leading-relaxed text-slate-600 sm:text-base border-l-2 border-brand-500 pl-3 italic">
              {chapter.summary}
            </p>
          )}
        </header>

        {/* Executive Summary / "At a Glance" Card: Eliminates reading fatigue! */}
        <div className="mb-10 overflow-hidden rounded-xl border border-brand-200/80 bg-gradient-to-br from-brand-50/40 via-white to-slate-50/50 p-5 shadow-2xs">
          <div className="flex items-center justify-between gap-2 border-b border-brand-100/70 pb-3">
            <div className="flex items-center gap-2">
              <Zap className="size-4 text-brand-600" />
              <span className="text-xs font-bold tracking-wider text-brand-900 uppercase">
                At a Glance · 30-Second Executive Summary
              </span>
            </div>

            {chapter.primaryRoute && (
              <Link
                href={chapter.primaryRoute}
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-brand-700 hover:text-brand-900 underline decoration-brand-300"
              >
                <span>Try {chapter.primaryRoute}</span>
                <ExternalLink className="size-3" />
              </Link>
            )}
          </div>

          {/* Golden Rule Banner */}
          {chapter.goldenRule && (
            <div className="mt-3 rounded-lg bg-amber-50/90 border border-amber-200/70 p-3 text-xs leading-relaxed text-amber-950">
              <span className="font-bold uppercase tracking-wider text-[10px] text-amber-800 block mb-0.5">
                ★ Core Operational Rule
              </span>
              <span>{chapter.goldenRule}</span>
            </div>
          )}

          {/* Key Takeaways 3-Point Grid */}
          {chapter.quickTakeaways && chapter.quickTakeaways.length > 0 && (
            <div className="mt-4 space-y-2">
              <p className="text-[11px] font-bold tracking-wider text-slate-400 uppercase">
                Key Platform Capabilities
              </p>
              <div className="space-y-1.5">
                {chapter.quickTakeaways.map((item, idx) => (
                  <div key={idx} className="flex items-start gap-2 text-xs text-slate-700 leading-relaxed">
                    <CheckCircle2 className="size-3.5 text-emerald-600 shrink-0 mt-0.5" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Standard 3-Step Flow Pills */}
          {chapter.workflowSteps && chapter.workflowSteps.length > 0 && (
            <div className="mt-4 border-t border-slate-100 pt-3">
              <div className="flex items-center gap-1.5 text-[11px] font-bold tracking-wider text-slate-400 uppercase mb-2">
                <Workflow className="size-3.5 text-brand-600" />
                <span>Standard Operational Workflow</span>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {chapter.workflowSteps.map((step, idx) => (
                  <div key={idx} className="flex items-center gap-1.5">
                    <span className="rounded-md bg-white border border-slate-200/90 px-2.5 py-1 text-xs font-semibold text-slate-800 shadow-2xs">
                      {step}
                    </span>
                    {idx < chapter.workflowSteps!.length - 1 && (
                      <ChevronRight className="size-3 text-slate-300 shrink-0" />
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Applicable Roles Footer */}
          {chapter.applicableRoles && chapter.applicableRoles.length > 0 && (
            <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center gap-2 text-[11px] text-slate-500">
              <Users className="size-3.5 text-slate-400 shrink-0" />
              <span className="font-medium text-slate-400">Target Roles:</span>
              <div className="flex flex-wrap gap-1">
                {chapter.applicableRoles.map((role) => (
                  <span
                    key={role}
                    className="rounded bg-slate-100 px-1.5 py-0.2 font-medium text-slate-600"
                  >
                    {role}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Detailed Chapter Markdown Body (With Mermaid Graphs, Code Blocks, Tables) */}
        <div className="prose-content">
          <DocMarkdown text={chapter.content} />
        </div>

        {/* Chapter Pagination (Previous / Next) */}
        <footer className="mt-14 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 border-t border-slate-100 pt-8">
          {prevChapter ? (
            <Link
              href={`/docs/${prevChapter.slug}`}
              className="group flex flex-1 items-center gap-3.5 rounded-xl border border-slate-200/90 p-4 transition-all hover:border-brand-400 hover:bg-brand-50/20 hover:shadow-xs"
            >
              <ArrowLeft className="size-4 text-slate-400 transition-transform group-hover:-translate-x-1 group-hover:text-brand-600" />
              <div className="min-w-0">
                <p className="text-[10px] font-bold tracking-wider text-slate-400 uppercase">
                  Previous Chapter
                </p>
                <p className="text-xs font-bold text-slate-900 truncate group-hover:text-brand-700">
                  Ch {prevChapter.number}: {prevChapter.shortTitle}
                </p>
              </div>
            </Link>
          ) : (
            <div className="flex-1" />
          )}

          {nextChapter ? (
            <Link
              href={`/docs/${nextChapter.slug}`}
              className="group flex flex-1 items-center justify-end text-right gap-3.5 rounded-xl border border-slate-200/90 p-4 transition-all hover:border-brand-400 hover:bg-brand-50/20 hover:shadow-xs"
            >
              <div className="min-w-0">
                <p className="text-[10px] font-bold tracking-wider text-slate-400 uppercase">
                  Next Chapter
                </p>
                <p className="text-xs font-bold text-slate-900 truncate group-hover:text-brand-700">
                  Ch {nextChapter.number}: {nextChapter.shortTitle}
                </p>
              </div>
              <ArrowRight className="size-4 text-slate-400 transition-transform group-hover:translate-x-1 group-hover:text-brand-600" />
            </Link>
          ) : (
            <div className="flex-1" />
          )}
        </footer>
      </article>

      {/* Sticky Right-Hand Table of Contents */}
      <TableOfContents items={toc} />
    </div>
  );
}
