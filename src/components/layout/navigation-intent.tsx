"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

type PrefetchKind = NonNullable<Parameters<ReturnType<typeof useRouter>["prefetch"]>[1]>["kind"];
/**
 * Fetch the whole page, data included. The default ("auto") only fetches a
 * dynamic page down to its nearest loading boundary, which here is nothing.
 */
const FULL_PREFETCH = "full" as PrefetchKind;

/** A fresh prefetch at most this often per URL (the router also dedupes). */
const REPREFETCH_AFTER_MS = 5_000;

/**
 * Starts loading a page as soon as the user shows intent to open it (pointer
 * over a link, keyboard focus, or a finger touching it) instead of on click.
 * Pages here are dynamic (they read the session), so the default viewport
 * prefetch fetches nothing; hover-to-click is typically 150–300 ms, which hides
 * the network round trip and the server render completely.
 *
 * Prefetched data is held for at most `staleTimes.static` (next.config.ts), and
 * every mutation calls router.refresh(), which discards it.
 */
export function NavigationIntent() {
  const router = useRouter();

  useEffect(() => {
    const lastPrefetch = new Map<string, number>();

    function onIntent(event: Event) {
      const anchor = (event.target as Element | null)?.closest?.("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) return;
      if (anchor.origin !== window.location.origin || anchor.target || anchor.hasAttribute("download")) return;
      // Pages only: not API routes or files such as the CSV templates.
      if (anchor.pathname.startsWith("/api/") || /\.[a-z0-9]+$/i.test(anchor.pathname)) return;

      const href = anchor.pathname + anchor.search;
      if (href === window.location.pathname + window.location.search) return;
      const now = Date.now();
      if (now - (lastPrefetch.get(href) ?? 0) < REPREFETCH_AFTER_MS) return;
      lastPrefetch.set(href, now);
      router.prefetch(href, { kind: FULL_PREFETCH });
    }

    const options = { passive: true, capture: true } as const;
    document.addEventListener("pointerover", onIntent, options);
    document.addEventListener("touchstart", onIntent, options);
    document.addEventListener("focusin", onIntent, options);
    return () => {
      document.removeEventListener("pointerover", onIntent, options);
      document.removeEventListener("touchstart", onIntent, options);
      document.removeEventListener("focusin", onIntent, options);
    };
  }, [router]);

  return null;
}
