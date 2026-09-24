import { Sidebar } from "@/components/layout/sidebar";
import { UserMenu } from "@/components/layout/user-menu";
import { permissionsFor, ROLE_LABELS } from "@/lib/permissions";
import { requireUser } from "@/server/auth/current-user";

/** Authenticated application shell. Reading the session makes every page dynamic. */
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();

  return (
    <div className="min-h-screen">
      <Sidebar permissions={permissionsFor(user.role)} />
      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex h-14 items-center justify-end border-b border-slate-200 bg-white/90 px-4 backdrop-blur sm:px-6">
          <UserMenu name={user.name} roleLabel={ROLE_LABELS[user.role]} />
        </header>
        <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
