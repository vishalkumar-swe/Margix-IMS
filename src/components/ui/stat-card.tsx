import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/cn";

export function StatCard({
  label,
  value,
  icon: Icon,
  href,
  tone = "neutral",
  hint,
}: {
  label: string;
  value: string | number;
  icon: LucideIcon;
  href?: string;
  tone?: "neutral" | "warning" | "danger";
  hint?: string;
}) {
  const content = (
    <>
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-slate-500">{label}</p>
        <Icon
          className={cn(
            "size-4",
            tone === "danger" ? "text-red-500" : tone === "warning" ? "text-amber-500" : "text-slate-400",
          )}
          aria-hidden
        />
      </div>
      <p
        className={cn(
          "mt-2 text-2xl font-semibold tabular-nums",
          tone === "danger" ? "text-red-700" : tone === "warning" ? "text-amber-700" : "text-slate-900",
        )}
      >
        {value}
      </p>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </>
  );

  const className = "block glass rounded-xl border p-4 shadow-sm";
  return href ? (
    <Link href={href} className={cn(className, "transition-colors hover:border-brand-300")}>
      {content}
    </Link>
  ) : (
    <div className={className}>{content}</div>
  );
}
