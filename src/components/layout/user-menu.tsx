"use client";

import { LogOut } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { apiRequest } from "@/lib/api-client";
import { CHECKLIST_STATUS_LABELS, unresolvedItems, type ChecklistItem, type DailyChecklist } from "@/lib/checklist";

export function UserMenu({ name, roleLabel }: { name: string; roleLabel: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [unresolved, setUnresolved] = useState<ChecklistItem[] | null>(null);

  /** Before signing out, list what is still open on today's checklist (when the administrator enabled it). */
  async function requestSignOut() {
    setPending(true);
    let open: ChecklistItem[] = [];
    try {
      const checklist = await apiRequest<DailyChecklist>("/checklist");
      if (checklist.confirmOnLogout) open = unresolvedItems(checklist.items);
    } catch {
      // Never block signing out on the checklist.
    }
    if (open.length > 0) {
      setPending(false);
      setUnresolved(open);
      return;
    }
    await signOut();
  }

  async function signOut() {
    setPending(true);
    try {
      await apiRequest("/auth/logout", { method: "POST" });
    } finally {
      router.replace("/login");
      router.refresh();
    }
  }

  const initials = name
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="flex items-center gap-3">
      <Link href="/account" className="flex items-center gap-3 rounded-md px-1 py-1 hover:bg-slate-100" title="My account">
        <span className="hidden text-right sm:block">
          <span className="block text-sm font-medium text-slate-900">{name}</span>
          <span className="block text-xs text-slate-500">{roleLabel}</span>
        </span>
        <span className="flex size-8 items-center justify-center rounded-full bg-brand-500 text-xs font-semibold text-black">
          {initials}
        </span>
      </Link>
      <Button variant="ghost" size="icon" onClick={requestSignOut} loading={pending} aria-label="Sign out" title="Sign out">
        {!pending && <LogOut aria-hidden />}
      </Button>

      <Dialog
        open={unresolved !== null}
        onClose={() => setUnresolved(null)}
        title="Before you sign out"
        description="These items on today's checklist are still open."
      >
        <ul className="max-h-72 space-y-2 overflow-y-auto">
          {unresolved?.map((item) => (
            <li key={item.id} className="flex items-start justify-between gap-3 rounded-md border border-slate-200 px-3 py-2">
              <div className="min-w-0">
                {item.href ? (
                  <Link href={item.href} onClick={() => setUnresolved(null)} className="text-sm font-medium text-brand-700 hover:underline">
                    {item.title}
                  </Link>
                ) : (
                  <p className="text-sm font-medium text-slate-900">{item.title}</p>
                )}
                {item.detail && <p className="text-xs text-slate-500">{item.detail}</p>}
              </div>
              <Badge tone={item.status === "CRITICAL" ? "danger" : item.status === "OVERDUE" ? "warning" : "info"}>
                {CHECKLIST_STATUS_LABELS[item.status]}
              </Badge>
            </li>
          ))}
        </ul>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setUnresolved(null)}>
            Stay signed in
          </Button>
          <Button variant="danger" onClick={signOut} loading={pending}>
            Sign out anyway
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
