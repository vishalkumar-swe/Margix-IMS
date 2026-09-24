import Link from "next/link";
import { ANALYTICS_TAB_LABELS, ANALYTICS_TABS } from "@/lib/analytics";
import { cn } from "@/lib/cn";
import { tabHref, type AnalyticsView } from "./links";

/** Section tabs as links: the tab is part of the URL, filters carry over. */
export function AnalyticsTabs({ view }: { view: AnalyticsView }) {
  return (
    <nav aria-label="Analytics sections" className="mb-4 flex gap-1 overflow-x-auto border-b border-slate-200">
      {ANALYTICS_TABS.map((tab) => {
        const active = tab === view.tab;
        return (
          <Link
            key={tab}
            href={tabHref(view, tab)}
            aria-current={active ? "page" : undefined}
            className={cn(
              "-mb-px border-b-2 px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors",
              active ? "border-brand-500 text-slate-900" : "border-transparent text-slate-500 hover:text-slate-800",
            )}
          >
            {ANALYTICS_TAB_LABELS[tab]}
          </Link>
        );
      })}
    </nav>
  );
}
