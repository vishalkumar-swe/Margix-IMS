import { requireUser } from "@/server/auth/current-user";

/** Printable documents: authenticated, but without the application shell. */
export default async function PrintLayout({ children }: LayoutProps<"/">) {
  await requireUser();
  return <main className="min-h-screen bg-slate-100 py-6 print:bg-white print:py-0">{children}</main>;
}
