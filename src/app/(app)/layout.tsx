import { cookies } from "next/headers";
import { Suspense } from "react";
import { LiveUpdates } from "@/components/layout/live-updates";
import { NavigationIntent } from "@/components/layout/navigation-intent";
import { NavigationProgress } from "@/components/layout/navigation-progress";
import { Sidebar } from "@/components/layout/sidebar";
import { ThemeSwitcher } from "@/components/layout/theme-switcher";
import { UserMenu } from "@/components/layout/user-menu";
import { GlobalScan } from "@/features/scan/global-scan";
import { permissionsFor, ROLE_LABELS } from "@/lib/permissions";
import { parseTheme, THEME_COOKIE } from "@/lib/theme";
import { requireUser } from "@/server/auth/current-user";

/** Authenticated application shell. Reading the session makes every page dynamic. */
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);

  return (
    <div data-theme={theme} className="app-backdrop min-h-screen text-slate-900">
      <NavigationIntent />
      <LiveUpdates />
      <Suspense fallback={null}>
        <NavigationProgress />
      </Suspense>
      <Sidebar permissions={permissionsFor(user.role)} />
      <div className="lg:pl-64">
        <header className="glass-strong sticky top-0 z-20 flex h-14 items-center justify-end gap-4 border-b px-4 sm:px-6">
          <GlobalScan className="ml-12 w-full max-w-sm lg:ml-0" />
          <ThemeSwitcher initial={theme} />
          <UserMenu name={user.name} roleLabel={ROLE_LABELS[user.role]} />
        </header>
        <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
