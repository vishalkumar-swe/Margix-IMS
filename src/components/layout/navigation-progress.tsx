"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

/** Navigations faster than this show no bar at all (no flicker). */
const SHOW_AFTER_MS = 80;
/** Safety net: never leave the bar running. */
const GIVE_UP_AFTER_MS = 15_000;

/**
 * Thin progress bar along the top edge while an in-app link navigation is in
 * flight, so a click always gets visible feedback even when the page has not
 * been prefetched.
 */
export function NavigationProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pendingSince, setPendingSince] = useState<number | null>(null);
  const [visible, setVisible] = useState(false);

  // Arrival at the new URL ends the navigation.
  const location = `${pathname}?${searchParams.toString()}`;
  const [lastLocation, setLastLocation] = useState(location);
  if (location !== lastLocation) {
    setLastLocation(location);
    setPendingSince(null);
    setVisible(false);
  }

  useEffect(() => {
    function onClick(event: MouseEvent) {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element | null)?.closest?.("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) return;
      if (anchor.origin !== window.location.origin || anchor.target || anchor.hasAttribute("download")) return;
      if (anchor.pathname.startsWith("/api/") || /\.[a-z0-9]+$/i.test(anchor.pathname)) return;
      if (anchor.pathname + anchor.search === window.location.pathname + window.location.search) return;
      setPendingSince(Date.now());
    }
    // Capture phase: <Link> calls preventDefault() in its own (bubbling) handler.
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  useEffect(() => {
    if (pendingSince === null) return;
    const show = window.setTimeout(() => setVisible(true), SHOW_AFTER_MS);
    const giveUp = window.setTimeout(() => {
      setPendingSince(null);
      setVisible(false);
    }, GIVE_UP_AFTER_MS);
    return () => {
      window.clearTimeout(show);
      window.clearTimeout(giveUp);
    };
  }, [pendingSince]);

  return (
    <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 z-50 h-0.5 overflow-hidden">
      <div
        className={
          visible
            ? "h-full w-4/5 bg-brand-500 transition-[width] duration-[2000ms] ease-out motion-reduce:transition-none"
            : "h-full w-0 bg-brand-500"
        }
      />
    </div>
  );
}
