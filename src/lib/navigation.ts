import type { useRouter } from "next/navigation";

type Router = ReturnType<typeof useRouter>;

/**
 * Navigates after a successful mutation without serving stale prefetched data.
 *
 * `refresh()` invalidates the client router cache synchronously; the `push()`
 * dispatched right after it takes priority and discards the pending refresh
 * request. The result is one round trip instead of two sequential ones
 * (`push()` then `refresh()`), and no page cached before the change can be
 * shown afterwards.
 */
export function pushFresh(router: Router, href: string): void {
  router.refresh();
  router.push(href);
}

/** As pushFresh, replacing the current history entry (e.g. to add a confirmation to the URL). */
export function replaceFresh(router: Router, href: string): void {
  router.refresh();
  router.replace(href, { scroll: false });
}
