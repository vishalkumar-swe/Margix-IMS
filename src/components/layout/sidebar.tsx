"use client";

import { Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import type { Permission } from "@/lib/permissions";
import { BrandLogo } from "./brand-logo";
import { NAV_SECTIONS, type NavSection } from "./navigation";

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

function NavList({
  sections,
  pathname,
  onNavigate,
}: {
  sections: NavSection[];
  pathname: string;
  onNavigate?: () => void;
}) {
  return (
    <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-5" aria-label="Main">
      {sections.map((section) => (
        <div key={section.title}>
          <p className="px-2 text-xs font-semibold tracking-wide text-slate-400 uppercase">{section.title}</p>
          <ul className="mt-2 space-y-0.5">
            {section.items.map((item) => {
              const active = isActive(pathname, item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm font-medium transition-colors",
                      active ? "bg-brand-50 text-brand-700" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
                    )}
                  >
                    <item.icon className="size-4 shrink-0" aria-hidden />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

/**
 * Two navigations, deliberately: a permanent column from `lg` up, and a
 * separate modal drawer below it. Splitting them means the desktop sidebar is
 * never `inert`, and the closed drawer (off-canvas but still in the DOM) is
 * removed from the tab order instead of swallowing focus.
 */
export function Sidebar({ permissions }: { permissions: Permission[] }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const allowed = new Set(permissions);

  const sections: NavSection[] = NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter((item) => allowed.has(item.permission)),
  })).filter((section) => section.items.length > 0);

  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        return;
      }
      if (event.key !== "Tab" || !panel) return;
      // Keep Tab inside the drawer while it is modal.
      const focusable = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (element) => element.offsetParent !== null,
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      (previousFocus ?? triggerRef.current)?.focus();
    };
  }, [open]);

  return (
    <>
      {/* Desktop column — always present, never inert. */}
      <aside
        className="glass-strong fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r lg:flex"
        aria-label="Main navigation"
      >
        <div className="flex h-14 items-center border-b border-slate-200 px-5">
          <Link href="/dashboard" className="flex items-center" aria-label="Margix India — dashboard">
            <BrandLogo variant="wordmark" className="h-6" priority />
          </Link>
        </div>
        <NavList sections={sections} pathname={pathname} />
      </aside>

      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        className="glass fixed top-3 left-3 z-30 rounded-md border p-2 lg:hidden"
        aria-label="Open navigation"
        aria-expanded={open}
      >
        <Menu className="size-5 text-slate-700" aria-hidden />
      </button>

      {open && (
        <div className="fixed inset-0 z-30 bg-slate-900/40 lg:hidden" onClick={() => setOpen(false)} aria-hidden="true" />
      )}

      {/* Mobile drawer — modal, and out of the tab order while closed. */}
      <aside
        ref={panelRef}
        inert={!open}
        role="dialog"
        aria-modal="true"
        aria-label="Navigation"
        className={cn(
          "glass-strong fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r transition-transform duration-200 lg:hidden",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex h-14 items-center justify-between border-b border-slate-200 px-5">
          <Link
            href="/dashboard"
            className="flex items-center"
            aria-label="Margix India — dashboard"
            onClick={() => setOpen(false)}
          >
            <BrandLogo variant="wordmark" className="h-6" />
          </Link>
          <button
            ref={closeRef}
            type="button"
            onClick={() => setOpen(false)}
            className="rounded p-1 text-slate-500 transition-colors hover:bg-slate-100"
            aria-label="Close navigation"
          >
            <X className="size-5" aria-hidden />
          </button>
        </div>
        <NavList sections={sections} pathname={pathname} onNavigate={() => setOpen(false)} />
      </aside>
    </>
  );
}
