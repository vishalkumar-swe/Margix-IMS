import { cookies } from "next/headers";
import { Suspense } from "react";
import { LiveUpdates } from "@/components/layout/live-updates";
import { NavigationIntent } from "@/components/layout/navigation-intent";
import { NavigationProgress } from "@/components/layout/navigation-progress";
import { Sidebar } from "@/components/layout/sidebar";
import { ThemeSwitcher } from "@/components/layout/theme-switcher";
import { UserMenu } from "@/components/layout/user-menu";
import { GlobalScan } from "@/features/scan/global-scan";
import { ChecklistProvider } from "@/features/checklist/checklist-provider";
import { OpenChecklistButton } from "@/features/checklist/open-checklist-button";
import { NotificationBell } from "@/features/notifications/notification-bell";
import { permissionsFor, ROLE_LABELS } from "@/lib/permissions";
import { parseTheme, THEME_COOKIE } from "@/lib/theme";
import { requireUser } from "@/server/auth/current-user";
import { shouldShowChecklistToday } from "@/server/modules/checklist/checklist.queries";
import { countUnreadNotifications } from "@/server/modules/notifications/notifications.queries";

/** Authenticated application shell. Reading the session makes every page dynamic. */
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);
  const [unread, showChecklist] = await Promise.all([countUnreadNotifications(user.id), shouldShowChecklistToday(user.id)]);

  return (
    <div data-theme={theme} className="app-backdrop min-h-screen text-slate-900">
      <ChecklistProvider autoOpen={showChecklist}>
        <NavigationIntent />
        <LiveUpdates />
        <Suspense fallback={null}>
          <NavigationProgress />
        </Suspense>
        <Sidebar permissions={permissionsFor(user.role)} />
        <div className="lg:pl-64">
          <header className="glass-strong sticky top-0 z-20 flex h-14 items-center justify-end gap-1 border-b px-3 sm:gap-2 sm:px-6">
            <GlobalScan className="mr-auto ml-12 w-full max-w-[8rem] sm:max-w-sm lg:ml-0" />
            <OpenChecklistButton />
            <NotificationBell unread={unread} />
            <ThemeSwitcher initial={theme} />
            <span className="mx-1 hidden h-6 w-px bg-slate-200 sm:block" aria-hidden />
            <UserMenu name={user.name} roleLabel={ROLE_LABELS[user.role]} />
          </header>
          <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">{children}</main>
        </div>
      </ChecklistProvider>
    </div>
  );
}
