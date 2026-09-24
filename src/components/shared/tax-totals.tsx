import { cn } from "@/lib/cn";
import { formatAmount } from "@/lib/format";
import type { TaxSummary } from "@/lib/tax";

/**
 * Document summary of a priced document: subtotal, discount, taxable value,
 * CGST + SGST or IGST, other charges and the grand total (₹). Used live in
 * the line editors and on detail pages.
 */
export function TaxTotals({
  summary,
  otherChargesLabel,
  className,
}: {
  summary: TaxSummary;
  otherChargesLabel?: string | null;
  className?: string;
}) {
  const intra = summary.taxType === "INTRA";
  return (
    <dl className={cn("space-y-1.5 text-sm", className)}>
      <Row label="Subtotal" value={formatAmount(summary.subtotal)} />
      <Row label="Discount" value={`− ${formatAmount(summary.discount)}`} />
      <Row label="Taxable value" value={formatAmount(summary.taxable)} strong />
      {intra ? (
        <>
          <Row label="CGST" value={formatAmount(summary.cgst)} />
          <Row label="SGST" value={formatAmount(summary.sgst)} />
        </>
      ) : (
        <Row label="IGST" value={formatAmount(summary.igst)} />
      )}
      <Row
        label={otherChargesLabel ? `Other charges (${otherChargesLabel})` : "Other charges"}
        value={formatAmount(summary.otherCharges)}
      />
      <div className="flex items-baseline justify-between gap-4 border-t border-slate-200 pt-2 text-base font-semibold text-slate-900">
        <dt>Grand total</dt>
        <dd className="tabular-nums">₹ {formatAmount(summary.grandTotal)}</dd>
      </div>
    </dl>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={cn("flex items-center justify-between gap-4", strong ? "font-medium text-slate-900" : "text-slate-600")}>
      <dt>{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}
