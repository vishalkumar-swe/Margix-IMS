"use client";

import { Check, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { Input } from "@/components/ui/form-controls";
import { apiRequest } from "@/lib/api-client";
import { cn } from "@/lib/cn";

export interface HsnChoice {
  code: string;
  description: string;
  gstRate: string;
  /** Why it is recommended (suggestions only). */
  reason?: string;
}

const DEBOUNCE_MS = 300;

/** Fetches `path` after the inputs settle; ignores responses that arrive out of order. */
function useDebouncedFetch<T>(path: string | null): T[] {
  const [result, setResult] = useState<{ path: string; items: T[] } | null>(null);
  useEffect(() => {
    if (!path) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      apiRequest<T[] | { items: T[] }>(path)
        .then((data) => {
          if (!cancelled) setResult({ path, items: Array.isArray(data) ? data : data.items });
        })
        .catch(() => {
          if (!cancelled) setResult({ path, items: [] });
        });
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [path]);
  return path && result?.path === path ? result.items : [];
}

/**
 * HSN code field with recommendations: codes suggested from the product's
 * name, description and category (category default, similar products, HSN
 * descriptions), plus a search of the whole HSN master as the user types.
 */
export function HsnPicker({
  id,
  value,
  onChange,
  product,
  invalid,
}: {
  id: string;
  value: string;
  onChange: (choice: HsnChoice | { code: string }) => void;
  product: { name: string; description: string; categoryId: string };
  invalid?: boolean;
}) {
  const hasProductInfo = product.name.trim().length >= 3 || Boolean(product.categoryId);
  const suggestPath = hasProductInfo
    ? `/hsn/suggest?${new URLSearchParams({
        ...(product.name.trim() && { name: product.name.trim() }),
        ...(product.description.trim() && { description: product.description.trim() }),
        ...(product.categoryId && { categoryId: product.categoryId }),
      })}`
    : null;
  const suggestions = useDebouncedFetch<HsnChoice>(suggestPath);

  const typed = value.trim();
  const searchPath = typed.length >= 2 ? `/hsn?${new URLSearchParams({ q: typed, activeOnly: "true", pageSize: "6" })}` : null;
  const searchResults = useDebouncedFetch<HsnChoice>(searchPath);

  const suggestedCodes = new Set(suggestions.map((s) => s.code));
  const choices: HsnChoice[] = [...suggestions, ...searchResults.filter((r) => !suggestedCodes.has(r.code))].slice(0, 6);

  return (
    <div className="space-y-2">
      <Input
        id={id}
        inputMode="numeric"
        value={value}
        placeholder="Search code or pick a suggestion"
        aria-invalid={invalid}
        onChange={(e) => onChange({ code: e.target.value })}
        autoComplete="off"
      />
      {choices.length > 0 && (
        <ul className="divide-y divide-slate-100 rounded-md border border-slate-200 bg-white text-sm" aria-label="HSN suggestions">
          {choices.map((choice) => {
            const selected = choice.code === typed;
            return (
              <li key={choice.code}>
                <button
                  type="button"
                  onClick={() => onChange(choice)}
                  className={cn(
                    "flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-brand-50 focus-visible:bg-brand-50 focus-visible:outline-none",
                    selected && "bg-brand-50",
                  )}
                >
                  {selected ? (
                    <Check className="mt-0.5 size-4 shrink-0 text-brand-700" aria-hidden />
                  ) : choice.reason ? (
                    <Sparkles className="mt-0.5 size-4 shrink-0 text-brand-600" aria-hidden />
                  ) : (
                    <span className="size-4 shrink-0" aria-hidden />
                  )}
                  <span className="min-w-0">
                    <span className="font-mono font-medium">{choice.code}</span>
                    <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-xs font-medium">{choice.gstRate}% GST</span>
                    <span className="block truncate text-xs text-slate-600">{choice.description}</span>
                    {choice.reason && <span className="block text-xs text-brand-700">{choice.reason}</span>}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
