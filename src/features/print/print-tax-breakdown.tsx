import { amountInWords } from "@/lib/amount-in-words";
import { formatAmount, formatQuantity } from "@/lib/format";
import type { PricedDocumentView } from "@/lib/tax";
import { PrintCell, PrintTable } from "./printed-document";

/**
 * Printed GST breakdown: per-line values (CGST + SGST or IGST, whichever
 * applies) and the document summary with the amount in words.
 */
export function PrintTaxLines({ view }: { view: PricedDocumentView }) {
  const intra = view.taxType === "INTRA";
  return (
    <PrintTable
      headers={[
        { label: "#" },
        { label: "Item" },
        { label: "HSN" },
        { label: "Qty", numeric: true },
        { label: "Rate (₹)", numeric: true },
        { label: "Disc %", numeric: true },
        { label: "Taxable (₹)", numeric: true },
        { label: "GST %", numeric: true },
        ...(intra
          ? [
              { label: "CGST (₹)", numeric: true },
              { label: "SGST (₹)", numeric: true },
            ]
          : [{ label: "IGST (₹)", numeric: true }]),
        { label: "Amount (₹)", numeric: true },
      ]}
    >
      {view.lines.map((line) => (
        <tr key={line.key}>
          <PrintCell>{line.lineNo}</PrintCell>
          <PrintCell>
            {line.skuName}
            <span className="block font-mono text-[10px] text-slate-600">{line.skuCode}</span>
          </PrintCell>
          <PrintCell>{line.hsnCode ?? "—"}</PrintCell>
          <PrintCell numeric>
            {formatQuantity(line.quantity)} {line.unit}
          </PrintCell>
          <PrintCell numeric>
            {line.rate ? formatAmount(line.rate) : "—"}
            {line.rate && line.rateUnit !== line.unit && <span className="block text-[10px]">per {line.rateUnit}</span>}
          </PrintCell>
          <PrintCell numeric>{formatQuantity(line.discountPercent)}</PrintCell>
          <PrintCell numeric>{formatAmount(line.tax.taxable)}</PrintCell>
          <PrintCell numeric>{line.tax.gstRate}</PrintCell>
          {intra ? (
            <>
              <PrintCell numeric>
                {formatAmount(line.tax.cgst)}
                <span className="block text-[10px]">@{line.tax.cgstRate}%</span>
              </PrintCell>
              <PrintCell numeric>
                {formatAmount(line.tax.sgst)}
                <span className="block text-[10px]">@{line.tax.sgstRate}%</span>
              </PrintCell>
            </>
          ) : (
            <PrintCell numeric>
              {formatAmount(line.tax.igst)}
              <span className="block text-[10px]">@{line.tax.igstRate}%</span>
            </PrintCell>
          )}
          <PrintCell numeric>{formatAmount(line.tax.total)}</PrintCell>
        </tr>
      ))}
    </PrintTable>
  );
}

export function PrintTaxSummary({ view, totalLabel = "Grand total" }: { view: PricedDocumentView; totalLabel?: string }) {
  const s = view.summary;
  const rows: [string, string][] = [
    ["Subtotal", formatAmount(s.subtotal)],
    ["Discount", `− ${formatAmount(s.discount)}`],
    ["Taxable value", formatAmount(s.taxable)],
    ...(view.taxType === "INTRA"
      ? ([
          ["CGST", formatAmount(s.cgst)],
          ["SGST", formatAmount(s.sgst)],
        ] as [string, string][])
      : ([["IGST", formatAmount(s.igst)]] as [string, string][])),
    [view.otherChargesLabel ? `Other charges (${view.otherChargesLabel})` : "Other charges", formatAmount(s.otherCharges)],
  ];
  return (
    <div className="mt-4 grid grid-cols-2 gap-8 break-inside-avoid">
      <div className="text-xs">
        <p className="text-slate-500">Amount in words</p>
        <p className="mt-1 font-semibold">{amountInWords(s.grandTotal)}</p>
      </div>
      <table className="w-full border-collapse text-xs">
        <tbody>
          {rows.map(([label, value]) => (
            <tr key={label}>
              <td className="border border-slate-400 px-2 py-1">{label}</td>
              <td className="border border-slate-400 px-2 py-1 text-right tabular-nums">{value}</td>
            </tr>
          ))}
          <tr className="font-bold">
            <td className="border border-slate-400 bg-slate-100 px-2 py-1.5">{totalLabel} (₹)</td>
            <td className="border border-slate-400 bg-slate-100 px-2 py-1.5 text-right tabular-nums">{formatAmount(s.grandTotal)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
