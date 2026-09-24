"use client";

import { LogOut } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/api-client";

export function UserMenu({ name, roleLabel }: { name: string; roleLabel: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

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
        <span className="flex size-8 items-center justify-center rounded-full bg-brand-500 text-xs font-semibold text-slate-950">
          {initials}
        </span>
      </Link>
      <Button variant="ghost" size="icon" onClick={signOut} loading={pending} aria-label="Sign out" title="Sign out">
        {!pending && <LogOut aria-hidden />}
      </Button>
    </div>
  );
}
