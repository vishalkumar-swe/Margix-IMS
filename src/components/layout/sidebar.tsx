"use client";

import { Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/cn";
import type { Permission } from "@/lib/permissions";
import { BrandLogo } from "./brand-logo";
import { NAV_SECTIONS } from "./navigation";

function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

export function Sidebar({ permissions }: { permissions: Permission[] }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const allowed = new Set(permissions);

  const sections = NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter((item) => allowed.has(item.permission)),
  })).filter((section) => section.items.length > 0);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed top-3 left-3 z-30 rounded-md border border-slate-200 bg-white p-2 shadow-sm lg:hidden"
        aria-label="Open navigation"
      >
        <Menu className="size-5 text-slate-700" />
      </button>

      {open && (
        <div className="fixed inset-0 z-30 bg-slate-900/40 lg:hidden" onClick={() => setOpen(false)} aria-hidden />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-slate-200 bg-white transition-transform lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex h-14 items-center justify-between border-b border-slate-200 px-5">
          <Link href="/" className="flex items-center" aria-label="Margix India — dashboard">
            <BrandLogo variant="wordmark" className="h-6" priority />
          </Link>
          <button type="button" onClick={() => setOpen(false)} className="lg:hidden" aria-label="Close navigation">
            <X className="size-5 text-slate-500" />
          </button>
        </div>

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
                        onClick={() => setOpen(false)}
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
      </aside>
    </>
  );
}
