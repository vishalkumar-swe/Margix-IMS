import { Boxes } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LoginForm } from "@/features/auth/login-form";
import { getCurrentUser } from "@/server/auth/current-user";

export const metadata: Metadata = { title: "Sign in" };

/** Only same-site relative paths are honoured, never absolute URLs (open-redirect safe). */
function safeNext(value: string | string[] | undefined): string {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//") ? value : "/";
}

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  if (await getCurrentUser()) redirect("/");
  const { next } = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <span className="rounded-lg bg-brand-600 p-2.5">
            <Boxes className="size-6 text-white" aria-hidden />
          </span>
          <h1 className="mt-4 text-xl font-semibold text-slate-900">Sign in to Margix IMS</h1>
          <p className="mt-1 text-sm text-slate-500">Ledger-based inventory management</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <LoginForm next={safeNext(next)} />
        </div>
      </div>
    </main>
  );
}
