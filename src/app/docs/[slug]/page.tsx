import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Clock, Tag } from "lucide-react";
import { MANUAL_CHAPTERS, getChapterBySlug } from "@/lib/manual-content";
import { DocMarkdown } from "@/features/docs/doc-markdown";

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
    title: `${chapter.title} — Margix IMS Manual`,
    description: chapter.summary,
  };
}

export default async function DocChapterPage({ params }: Props) {
  const { slug } = await params;
  const chapter = getChapterBySlug(slug);

  if (!chapter) {
    notFound();
  }

  const currentIndex = MANUAL_CHAPTERS.findIndex((c) => c.slug === chapter.slug);
  const prevChapter = currentIndex > 0 ? MANUAL_CHAPTERS[currentIndex - 1] : null;
  const nextChapter = currentIndex < MANUAL_CHAPTERS.length - 1 ? MANUAL_CHAPTERS[currentIndex + 1] : null;

  return (
    <article className="space-y-6">
      {/* Chapter Header */}
      <div className="border-b border-slate-200 pb-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded bg-brand-50 px-2.5 py-0.5 font-mono text-xs font-bold text-brand-700">
            Chapter {chapter.number}
          </span>
          <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
            <Tag className="size-3" />
            {chapter.category}
          </span>
          <span className="flex items-center gap-1 text-xs text-slate-400">
            <Clock className="size-3" />
            {chapter.readingTime} read
          </span>
        </div>

        <h1 className="mt-3 text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">
          {chapter.title}
        </h1>
        {chapter.summary && (
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            {chapter.summary}
          </p>
        )}
      </div>

      {/* Render Markdown Content */}
      <DocMarkdown text={chapter.content} />

      {/* Chapter Pagination (Previous / Next) */}
      <div className="mt-12 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 border-t border-slate-200 pt-6">
        {prevChapter ? (
          <Link
            href={`/docs/${prevChapter.slug}`}
            className="group flex flex-1 items-center gap-3 rounded-lg border border-slate-200 p-3.5 transition-all hover:border-brand-300 hover:bg-brand-50/20"
          >
            <ArrowLeft className="size-4 text-slate-400 transition-transform group-hover:-translate-x-1 group-hover:text-brand-600" />
            <div className="min-w-0">
              <p className="text-[10px] font-semibold tracking-wider text-slate-400 uppercase">Previous Chapter</p>
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
            className="group flex flex-1 items-center justify-end text-right gap-3 rounded-lg border border-slate-200 p-3.5 transition-all hover:border-brand-300 hover:bg-brand-50/20"
          >
            <div className="min-w-0">
              <p className="text-[10px] font-semibold tracking-wider text-slate-400 uppercase">Next Chapter</p>
              <p className="text-xs font-bold text-slate-900 truncate group-hover:text-brand-700">
                Ch {nextChapter.number}: {nextChapter.shortTitle}
              </p>
            </div>
            <ArrowRight className="size-4 text-slate-400 transition-transform group-hover:translate-x-1 group-hover:text-brand-600" />
          </Link>
        ) : (
          <div className="flex-1" />
        )}
      </div>
    </article>
  );
}

