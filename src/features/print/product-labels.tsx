import type { ReactNode } from "react";
import { Barcode } from "./document-codes";
import { PrintButton } from "./print-button";

export interface ProductLabel {
  key: string;
  code: string;
  name: string;
  /** Without a barcode the SKU code is printed as Code 128 (lookups accept either). */
  barcode: string | null;
}

/**
 * A4 sheet of product labels, 3 × 8 per page (63.5 × 33.9 mm, the common
 * 24-up label stock): name, barcode and SKU code.
 */
export function ProductLabelSheet({ labels, back }: { labels: ProductLabel[]; back: ReactNode }) {
  return (
    <div className="mx-auto max-w-[210mm] bg-white p-6 text-slate-900 print:max-w-none print:p-0">
      <div className="mb-6 flex items-center justify-between print:hidden">
        {back}
        <PrintButton />
      </div>
      <div className="grid grid-cols-3 gap-x-[2.5mm]">
        {labels.map((label) => (
          <div
            key={label.key}
            className="flex h-[33.9mm] flex-col items-center justify-between overflow-hidden border border-dashed border-slate-300 px-2 py-1.5 text-center break-inside-avoid print:border-transparent"
          >
            <p className="line-clamp-2 text-[10px] leading-tight font-semibold">{label.name}</p>
            <Barcode
              value={label.barcode ?? label.code}
              label={`Barcode ${label.barcode ?? label.code}`}
              heightMm={9}
              includeText={Boolean(label.barcode)}
              className="w-[48mm]"
            />
            <p className="font-mono text-[9px]">{label.code}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Expands (label, copies) pairs into one entry per printed label. */
export function repeatLabels(items: { label: Omit<ProductLabel, "key">; copies: number }[]): ProductLabel[] {
  return items.flatMap(({ label, copies }, item) =>
    Array.from({ length: copies }, (_, copy) => ({ ...label, key: `${item}-${copy}` })),
  );
}
