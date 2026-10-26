import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 text-center">
      <p className="text-sm font-semibold text-brand-700">404</p>
      <h1 className="mt-2 text-2xl font-semibold text-slate-900">Page not found</h1>
      <p className="mt-2 text-sm text-slate-500">The page you are looking for does not exist.</p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <Link href="/" className={buttonVariants()}>
          Back to home
        </Link>
        <Link href="/dashboard" className={buttonVariants({ variant: "secondary" })}>
          Go to dashboard
        </Link>
      </div>
    </main>
  );
}
