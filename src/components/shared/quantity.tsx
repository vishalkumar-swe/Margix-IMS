import { cn } from "@/lib/cn";
import { formatQuantity, formatSignedQuantity, isZeroQuantity } from "@/lib/format";

/**
 * Renders a decimal quantity exactly (string in, no float). `signed` shows
 * +/− and colours increases green and decreases red.
 */
export function Quantity({
  value,
  unit,
  signed = false,
  className,
}: {
  value: string | { toString(): string };
  unit?: string;
  signed?: boolean;
  className?: string;
}) {
  const text = String(value);
  const tone = !signed || isZeroQuantity(text) ? null : text.startsWith("-") ? "text-red-700" : "text-emerald-700";
  return (
    <span className={cn("tabular-nums", tone, className)}>
      {signed ? formatSignedQuantity(text) : formatQuantity(text)}
      {unit && <span className="ml-1 text-xs text-slate-400">{unit}</span>}
    </span>
  );
}
