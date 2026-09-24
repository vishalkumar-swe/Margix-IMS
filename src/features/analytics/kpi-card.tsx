import { ArrowDownRight, ArrowRight, ArrowUpRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { formatPercentChange } from "@/lib/format";
import { InfoHint } from "./info-hint";

/**
 * Headline figure with its change vs the comparison period and a sparkline.
 * `goodWhen` says which direction is good news (sales up = good, dead stock
 * up = bad); "neutral" shows the change without judging it.
 */
export function KpiCard({
  label,
  value,
  change,
  comparison,
  goodWhen = "up",
  spark,
  hint,
  footer,
  href,
}: {
  label: string;
  value: string;
  /** % change; null = no base to compare with; undefined = not compared. */
  change?: number | null;
  comparison?: string;
  goodWhen?: "up" | "down" | "neutral";
  spark?: string[];
  hint?: string;
  footer?: ReactNode;
  href?: string;
}) {
  const content = (
    <>
      <div className="flex items-start justify-between gap-2">
        <p className="flex items-center gap-1.5 text-sm font-medium text-slate-500">
          {label}
          {hint && <InfoHint text={hint} />}
        </p>
        {spark && spark.length > 1 && <Sparkline values={spark} />}
      </div>
      <p className="mt-1 truncate text-2xl font-semibold text-slate-900 tabular-nums" title={value}>
        {value}
      </p>
      {change !== undefined && <ChangeIndicator change={change} goodWhen={goodWhen} comparison={comparison} />}
      {footer && <div className="mt-1 text-xs text-slate-500">{footer}</div>}
    </>
  );
  const className = "glass block rounded-xl border p-4";
  return href ? (
    <Link href={href} className={cn(className, "transition-colors hover:border-brand-300")}>
      {content}
    </Link>
  ) : (
    <div className={className}>{content}</div>
  );
}

function ChangeIndicator({
  change,
  goodWhen,
  comparison,
}: {
  change: number | null;
  goodWhen: "up" | "down" | "neutral";
  comparison?: string;
}) {
  if (change === null) {
    return <p className="mt-1 text-xs text-slate-500">No data to compare {comparison}</p>;
  }
  const direction = change > 0 ? "up" : change < 0 ? "down" : "flat";
  const tone =
    direction === "flat" || goodWhen === "neutral"
      ? "text-slate-600"
      : direction === goodWhen
        ? "text-emerald-700"
        : "text-red-700";
  const Icon = direction === "up" ? ArrowUpRight : direction === "down" ? ArrowDownRight : ArrowRight;
  return (
    <p className="mt-1 flex items-center gap-1 text-xs text-slate-500">
      <span className={cn("inline-flex items-center gap-0.5 font-medium tabular-nums", tone)}>
        <Icon className="size-3.5" aria-hidden />
        {formatPercentChange(change)}
      </span>
      {comparison}
    </p>
  );
}

/** Tiny trend line (decorative; the figure and its change carry the meaning). */
function Sparkline({ values }: { values: string[] }) {
  const width = 72;
  const height = 24;
  const numbers = values.map(Number);
  const min = Math.min(...numbers);
  const max = Math.max(...numbers);
  const span = max - min || 1;
  const points = numbers
    .map((v, i) => {
      const x = (i / (numbers.length - 1)) * (width - 4) + 2;
      const y = height - 2 - ((v - min) / span) * (height - 4);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden className="shrink-0">
      <polyline points={points} fill="none" stroke="var(--color-brand-600)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
