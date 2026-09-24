"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Bursts of changes (a GRN with many lines, a CSV import) cause one refresh. */
const DEBOUNCE_MS = 400;

/**
 * Keeps every open screen current: when anyone commits a change, the server
 * pushes an event (GET /api/v1/events) and the current page re-renders with
 * fresh data. router.refresh() keeps client state — typed form input, open
 * dialogs, scroll position — and also discards stale prefetched pages.
 *
 * A hidden tab does not refresh; it catches up once when shown again.
 */
export function LiveUpdates() {
  const router = useRouter();

  useEffect(() => {
    let timer: number | undefined;
    let missedWhileHidden = false;
    let connectedBefore = false;

    const refresh = () => {
      if (document.visibilityState === "visible") router.refresh();
      else missedWhileHidden = true;
    };
    const scheduleRefresh = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(refresh, DEBOUNCE_MS);
    };

    const source = new EventSource("/api/v1/events");
    source.addEventListener("change", scheduleRefresh);
    source.addEventListener("resync", scheduleRefresh);
    // After a reconnect (server restart, network blip) changes may have been missed.
    source.addEventListener("ready", () => {
      if (connectedBefore) scheduleRefresh();
      connectedBefore = true;
    });

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible" && missedWhileHidden) {
        missedWhileHidden = false;
        router.refresh();
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      window.clearTimeout(timer);
      source.close();
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [router]);

  return null;
}
