import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Clock,
  Tag,
  Share2,
  ChevronRight,
  BookOpen,
  Calendar,
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
    <div className="flex items-start">
      {/* Chapter Center Reading Card */}
      <article className="min-w-0 flex-1 rounded-2xl border border-slate-200/90 bg-white p-6 shadow-xs sm:p-10">
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
            <span className="inline-flex items-center gap-1 rounded-md bg-brand-50 px-2.5 py-1 font-mono text-xs font-bold text-brand-700">
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

        {/* Render Markdown Content with Interactive Mermaid Diagrams & Code Blocks */}
        <DocMarkdown text={chapter.content} />

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
