"use client";

import { Bell, CheckCheck, LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import { formatDateTime } from "@/lib/dates";

interface NotificationRow {
  id: string;
  title: string;
  body: string;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

/**
 * The in-app notification centre in the header. The unread count comes from
 * the server render, so live updates (router.refresh on the change feed) keep
 * it current; the list is fetched whenever the panel opens or the count changes.
 */
export function NotificationBell({ unread }: { unread: number }) {
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={container} className="relative">
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setOpen((value) => !value)}
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
        title="Notifications"
        aria-expanded={open}
        aria-haspopup="dialog"
        className="relative"
      >
        <Bell aria-hidden />
        {unread > 0 && (
          <span className="absolute top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold text-white">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </Button>
      {/* Remounted when the count changes, so an open panel shows new arrivals. */}
      {open && <NotificationPanel key={unread} unread={unread} onClose={() => setOpen(false)} />}
    </div>
  );
}

function NotificationPanel({ unread, onClose }: { unread: number; onClose: () => void }) {
  const router = useRouter();
  const [items, setItems] = useState<NotificationRow[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    apiRequest<{ items: NotificationRow[] }>("/notifications?limit=15").then(
      (data) => active && setItems(data.items),
      () => active && setFailed(true),
    );
    return () => {
      active = false;
    };
  }, []);

  async function openItem(item: NotificationRow) {
    onClose();
    if (!item.readAt) {
      await apiRequest(`/notifications/${item.id}/read`, { method: "POST" }).catch(() => {});
    }
    if (item.link) router.push(item.link);
    router.refresh();
  }

  async function markAllRead() {
    await apiRequest("/notifications/read-all", { method: "POST" }).catch(() => {});
    setItems((current) => current?.map((item) => ({ ...item, readAt: item.readAt ?? new Date().toISOString() })) ?? null);
    router.refresh();
  }

  return (
    <div
      role="dialog"
      aria-label="Notifications"
      className="absolute right-0 z-30 mt-2 w-[22rem] max-w-[calc(100vw-2rem)] glass-strong rounded-xl border shadow-2xl"
    >
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2.5">
        <p className="text-sm font-semibold text-slate-900">Notifications</p>
        <Button variant="ghost" size="sm" onClick={markAllRead} disabled={unread === 0}>
          <CheckCheck aria-hidden /> Mark all read
        </Button>
      </div>
      <div className="max-h-96 overflow-y-auto">
        {items === null && !failed && (
          <p className="flex items-center gap-2 px-4 py-6 text-sm text-slate-500">
            <LoaderCircle className="size-4 animate-spin" aria-hidden /> Loading…
          </p>
        )}
        {failed && <p className="px-4 py-6 text-sm text-red-600">Could not load notifications.</p>}
        {items && items.length === 0 && <p className="px-4 py-6 text-sm text-slate-500">No notifications yet.</p>}
        {items && items.length > 0 && (
          <ul className="divide-y divide-slate-100">
            {items.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => void openItem(item)}
                  className={cn("flex w-full gap-3 px-4 py-3 text-left hover:bg-slate-50", !item.readAt && "bg-brand-50/40")}
                >
                  <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", item.readAt ? "bg-transparent" : "bg-brand-500")} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className={cn("block text-sm", item.readAt ? "text-slate-700" : "font-medium text-slate-900")}>
                      {item.title}
                    </span>
                    <span className="mt-0.5 line-clamp-3 block text-xs whitespace-pre-line text-slate-500">{item.body}</span>
                    <span className="mt-1 block text-[11px] text-slate-400">{formatDateTime(item.createdAt)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
