import { cn } from "@/lib/cn";
import { formatQuantity, formatSignedQuantity } from "@/lib/format";

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
  const negative = text.startsWith("-");
  return (
    <span
      className={cn(
        "tabular-nums",
        signed && (negative ? "text-red-700" : "text-emerald-700"),
        className,
      )}
    >
      {signed ? formatSignedQuantity(text) : formatQuantity(text)}
      {unit && <span className="ml-1 text-xs text-slate-400">{unit}</span>}
    </span>
  );
}
