"use client";

import { X } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

const subscribeToNothing = () => () => {};

interface TargetState {
  element: HTMLElement | null;
  rect: DOMRect | null;
  container: Element | null;
}

const INITIAL: TargetState = { element: null, rect: null, container: null };

function rectChanged(a: DOMRect | null, b: DOMRect | null): boolean {
  if (!a || !b) return a !== b;
  return (
    Math.abs(a.top - b.top) > 0.5 ||
    Math.abs(a.left - b.left) > 0.5 ||
    Math.abs(a.width - b.width) > 0.5 ||
    Math.abs(a.height - b.height) > 0.5
  );
}

/** Finds a selector, waits for it across dialog mounts, and tracks its viewport rect. */
export function useSpotlightTarget(selector: string | null, enabled: boolean): TargetState {
  const [state, setState] = useState<TargetState>(INITIAL);
  const elementRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!enabled || !selector) {
      elementRef.current = null;
      return;
    }

    let cancelled = false;
    let observer: MutationObserver | null = null;
    const find = () => {
      const element = document.querySelector<HTMLElement>(selector);
      if (!element || cancelled) return Boolean(element);
      if (elementRef.current !== element) {
        elementRef.current = element;
        const rect = element.getBoundingClientRect();
        const outside = rect.top < 8 || rect.bottom > window.innerHeight - 8 || rect.left < 8 || rect.right > window.innerWidth - 8;
        if (outside) {
          element.scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" });
        }
        setState({
          element,
          rect: element.getBoundingClientRect(),
          container: element.closest("dialog[open]"),
        });
      }
      return true;
    };

    if (!find()) {
      observer = new MutationObserver(() => {
        if (find()) observer?.disconnect();
      });
      observer.observe(document.body, { childList: true, subtree: true });
    }

    const missingTimer = window.setInterval(() => {
      if (!elementRef.current) find();
    }, 250);

    // Track scroll, resize and transitions (dialog opening, layout shifts).
    let frame = 0;
    const tick = () => {
      const element = elementRef.current;
      if (element && document.contains(element)) {
        const rect = element.getBoundingClientRect();
        setState((previous) =>
          rectChanged(previous.rect, rect)
            ? { element, rect, container: element.closest("dialog[open]") }
            : previous,
        );
        frame = window.setTimeout(tick, 180);
      } else if (element) {
        elementRef.current = null;
        setState(INITIAL);
        frame = window.setTimeout(tick, 250);
      } else {
        frame = window.setTimeout(tick, 250);
      }
    };
    frame = window.setTimeout(tick, 180);

    return () => {
      cancelled = true;
      observer?.disconnect();
      window.clearInterval(missingTimer);
      window.clearTimeout(frame);
    };
  }, [enabled, selector]);

  return state;
}

interface SpotlightOverlayProps {
  rect: DOMRect | null;
  container?: Element | null;
  title: string;
  body: ReactNode;
  eyebrow?: string;
  stepLabel?: string;
  readOnly?: boolean;
  placement?: "top" | "bottom" | "auto";
  canPrevious?: boolean;
  nextLabel?: string;
  onPrevious?: () => void;
  onNext?: () => void;
  onAsk?: () => void;
  onClose?: () => void;
  askLabel?: string;
}

/**
 * Dimmed mask with a cut-out around the target and an anchored instruction
 * card. The mask never blocks pointer events, so the highlighted control stays
 * usable; the card itself is interactive.
 */
export function SpotlightOverlay({
  rect,
  container,
  title,
  body,
  eyebrow,
  stepLabel,
  readOnly,
  placement = "auto",
  canPrevious,
  nextLabel = "Next",
  onPrevious,
  onNext,
  onAsk,
  onClose,
  askLabel = "Ask a question",
}: SpotlightOverlayProps) {
  const mounted = useSyncExternalStore(subscribeToNothing, () => true, () => false);
  if (!mounted) return null;

  const viewportWidth = typeof window === "undefined" ? 1280 : window.innerWidth;
  const viewportHeight = typeof window === "undefined" ? 800 : window.innerHeight;
  const width = Math.min(380, viewportWidth - 32);
  const mobile = viewportWidth < 640;
  const estimatedHeight = 250;

  let top = viewportHeight - estimatedHeight - 24;
  let left = 16;
  if (!mobile && rect) {
    const below = rect.bottom + 16;
    const above = rect.top - estimatedHeight - 16;
    const preferBelow = placement === "bottom" || (placement === "auto" && below + estimatedHeight < viewportHeight - 16);
    top = preferBelow && below + estimatedHeight < viewportHeight - 16 ? below : above;
    if (top < 16) top = Math.min(below, viewportHeight - estimatedHeight - 16);
    left = Math.min(Math.max(16, rect.left + rect.width / 2 - width / 2), viewportWidth - width - 16);
  } else if (!mobile) {
    top = Math.max(16, (viewportHeight - estimatedHeight) / 2);
    left = Math.max(16, (viewportWidth - width) / 2);
  }

  const content = (
    <div className="pointer-events-none fixed inset-0 z-[90]" data-copilot-spotlight>
      {rect && (
        <>
          <div
            className="pointer-events-none fixed rounded-xl border-2 border-brand-500/90 shadow-[0_0_0_9999px_rgba(15,23,42,0.62)] transition-all duration-200"
            style={{ top: rect.top - 5, left: rect.left - 5, width: rect.width + 10, height: rect.height + 10 }}
            aria-hidden
          />
          <div
            className="pointer-events-none fixed animate-pulse rounded-xl border border-brand-300/70 transition-all duration-200"
            style={{ top: rect.top - 10, left: rect.left - 10, width: rect.width + 20, height: rect.height + 20 }}
            aria-hidden
          />
        </>
      )}
      <div
        role="dialog"
        aria-label={title}
        aria-live="polite"
        className={cn(
          "pointer-events-auto fixed rounded-xl border border-slate-200 bg-white p-4 text-slate-900 shadow-2xl",
          mobile && "right-3 left-3",
        )}
        style={mobile ? { bottom: 16, width: "auto" } : { top, left, width }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-[11px] font-semibold tracking-wide text-brand-700 uppercase">
              <span className="inline-block size-1.5 rounded-full bg-brand-500" aria-hidden />
              {eyebrow ?? "Guided walkthrough"}
              {stepLabel && <span className="font-normal text-slate-400 normal-case">· {stepLabel}</span>}
            </p>
            <h2 className="mt-1 text-sm font-semibold text-slate-900">{title}</h2>
          </div>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="shrink-0 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              aria-label="Dismiss walkthrough step"
            >
              <X className="size-4" aria-hidden />
            </button>
          )}
        </div>
        <div className="mt-2 text-sm leading-relaxed text-slate-600">{body}</div>
        {readOnly && (
          <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Read-only for your role. Follow along, then ask a manager or administrator to perform the write.
          </p>
        )}
        <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
          {onPrevious && (
            <Button variant="ghost" size="sm" onClick={onPrevious} disabled={!canPrevious}>
              Previous
            </Button>
          )}
          {onAsk && (
            <Button variant="secondary" size="sm" onClick={onAsk}>
              {askLabel}
            </Button>
          )}
          {onNext && (
            <Button size="sm" onClick={onNext}>
              {nextLabel}
            </Button>
          )}
        </div>
        {!rect && (
          <p className="mt-2 text-right text-[11px] text-slate-400">Waiting for the next control to appear…</p>
        )}
      </div>
    </div>
  );

  return createPortal(content, container ?? document.body);
}
