"use client";

import { X } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Modal dialog on the native <dialog> element: focus trapping, Escape to
 * close and inert background come from the browser.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      // Autofocus the first focusable field in the body instead of the close button.
      requestAnimationFrame(() => {
        const target = bodyRef.current?.querySelector<HTMLElement>(
          "input:not([type=hidden]):not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])",
        );
        target?.focus();
      });
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      aria-labelledby="dialog-title"
      className={cn(
        "surface-solid m-auto flex max-h-[calc(100vh-2rem)] w-[calc(100%-2rem)] max-w-lg flex-col rounded-xl border p-0 text-slate-900 shadow-2xl",
        className,
      )}
    >
      {open && (
        <>
          <header className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
            <div className="min-w-0">
              <h2 id="dialog-title" className="text-base font-semibold">
                {title}
              </h2>
              {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="shrink-0 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              aria-label="Close"
            >
              <X className="size-4" />
            </button>
          </header>
          <div ref={bodyRef} className="overflow-y-auto px-5 py-4">
            {children}
          </div>
        </>
      )}
    </dialog>
  );
}
