"use client";

import { X } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode, type SyntheticEvent } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/cn";

/**
 * Modal dialog on the native <dialog> element: focus trapping, Escape to
 * close and inert background come from the browser.
 * Rendered in a portal to prevent DOM nesting conflicts and event bubbling
 * when dialogs are opened from within other dialogs.
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
  const titleId = useId();
  const descriptionId = useId();
  const bodyRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      try {
        dialog.showModal();
      } catch {
        // Safe fallback if already open or unsupported in mock environment
      }
      // Autofocus the first focusable field in the body instead of the close button.
      requestAnimationFrame(() => {
        const target = bodyRef.current?.querySelector<HTMLElement>(
          "input:not([type=hidden]):not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])",
        );
        target?.focus();
      });
    }
    if (!open && dialog.open) {
      try {
        dialog.close();
      } catch {
        // Safe fallback
      }
    }
  }, [open, mounted]);

  const handleClose = (e: SyntheticEvent<HTMLDialogElement>) => {
    e.stopPropagation();
    if (e.target !== ref.current) return;
    onClose();
  };

  const handleCancel = (e: SyntheticEvent<HTMLDialogElement>) => {
    e.stopPropagation();
    if (e.target !== ref.current) return;
    onClose();
  };

  const handleBackdropClick = (e: React.MouseEvent<HTMLDialogElement>) => {
    const dialog = ref.current;
    if (!dialog || e.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    const isInDialog =
      rect.top <= e.clientY &&
      e.clientY <= rect.top + rect.height &&
      rect.left <= e.clientX &&
      e.clientX <= rect.left + rect.width;
    if (!isInDialog) {
      onClose();
    }
  };

  if (!mounted || typeof document === "undefined") {
    return null;
  }

  const content = (
    <dialog
      ref={ref}
      onClose={handleClose}
      onCancel={handleCancel}
      onClick={handleBackdropClick}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      className={cn(
        "surface-solid m-auto hidden max-h-[calc(100vh-2rem)] w-[calc(100%-2rem)] max-w-lg flex-col rounded-xl open:flex border p-0 text-slate-900 shadow-2xl backdrop:bg-black/50 backdrop:backdrop-blur-xs",
        className,
      )}
    >
      {open && (
        <>
          <header className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
            <div className="min-w-0">
              <h2 id={titleId} className="text-base font-semibold">
                {title}
              </h2>
              {description && <p id={descriptionId} className="mt-1 text-sm text-slate-500">{description}</p>}
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

  return createPortal(content, document.body);
}
