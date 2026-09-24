import { Package, X } from "lucide-react";
import Link from "next/link";

/**
 * Shown above a document list filtered to one product (e.g. "sales history"
 * opened from the slow-stock report), with a link that removes the filter.
 */
export function ProductFilterNotice({
  sku,
  clearHref,
}: {
  sku: { code: string; name: string } | null;
  clearHref: string;
}) {
  if (!sku) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-brand-50 px-4 py-2 text-sm text-slate-700">
      <Package className="size-4 text-brand-700" aria-hidden />
      <span>
        Only documents with <span className="font-medium">{sku.code}</span> · {sku.name}
      </span>
      <Link href={clearHref} className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:underline">
        <X className="size-3.5" aria-hidden /> Clear product filter
      </Link>
    </div>
  );
}
