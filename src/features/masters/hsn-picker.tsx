"use client";

import { Check, Sparkles, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
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
 * name, description and category, plus a search of the whole HSN master as the user types.
 * Closes suggestions cleanly upon selection or outside click.
 */
export function HsnPicker({
  id,
  value,
  onChange,
  product,
  invalid,
  dataTour,
}: {
  id: string;
  value: string;
  onChange: (choice: HsnChoice | { code: string }) => void;
  product: { name: string; description: string; categoryId: string };
  invalid?: boolean;
  /** Optional `data-tour` anchor for the guided walkthrough. */
  dataTour?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

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

  // Close suggestions when user clicks outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelect = (choice: HsnChoice) => {
    onChange(choice);
    // Explicitly close suggestions immediately upon selection so it doesn't linger
    setIsOpen(false);
  };

  return (
    <div ref={containerRef} className="relative space-y-1">
      <Input
        id={id}
        inputMode="numeric"
        value={value}
        data-tour={dataTour}
        placeholder="Search code or pick a suggestion"
        aria-invalid={invalid}
        onFocus={() => setIsOpen(true)}
        onChange={(e) => {
          onChange({ code: e.target.value });
          setIsOpen(true);
        }}
        autoComplete="off"
      />

      {isOpen && choices.length > 0 && (
        <div className="absolute top-full left-0 right-0 z-30 mt-1 max-h-60 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg ring-1 ring-black/5 animate-in fade-in zoom-in-95 duration-150">
          <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-500">
            <span>Recommended HSN & GST Rates</span>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="rounded p-0.5 text-slate-400 hover:text-slate-600 cursor-pointer"
              title="Close suggestions"
            >
              <X className="size-3.5" />
            </button>
          </div>
          <ul className="divide-y divide-slate-100 text-sm" aria-label="HSN suggestions">
            {choices.map((choice) => {
              const selected = choice.code === typed;
              return (
                <li key={choice.code}>
                  <button
                    type="button"
                    onClick={() => handleSelect(choice)}
                    className={cn(
                      "flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-brand-50 focus-visible:bg-brand-50 focus-visible:outline-none transition-colors cursor-pointer",
                      selected && "bg-brand-50/80 font-medium",
                    )}
                  >
                    {selected ? (
                      <Check className="mt-0.5 size-4 shrink-0 text-brand-700" aria-hidden />
                    ) : choice.reason ? (
                      <Sparkles className="mt-0.5 size-4 shrink-0 text-brand-600" aria-hidden />
                    ) : (
                      <span className="size-4 shrink-0" aria-hidden />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="font-mono font-bold text-slate-900">{choice.code}</span>
                      <span className="ml-2 rounded-full bg-emerald-100 text-emerald-800 px-2 py-0.5 text-[11px] font-bold">
                        {choice.gstRate}% GST
                      </span>
                      <span className="block truncate text-xs text-slate-600 mt-0.5">{choice.description}</span>
                      {choice.reason && <span className="block text-[11px] font-medium text-brand-700">{choice.reason}</span>}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
