import { Suspense } from "react";
import { LiveUpdates } from "@/components/layout/live-updates";
import { NavigationIntent } from "@/components/layout/navigation-intent";
import { NavigationProgress } from "@/components/layout/navigation-progress";
import { Sidebar } from "@/components/layout/sidebar";
import { UserMenu } from "@/components/layout/user-menu";
import { ChecklistProvider } from "@/features/checklist/checklist-provider";
import { OpenChecklistButton } from "@/features/checklist/open-checklist-button";
import { NotificationBell } from "@/features/notifications/notification-bell";
import { permissionsFor, ROLE_LABELS } from "@/lib/permissions";
import { requireUser } from "@/server/auth/current-user";
import { shouldShowChecklistToday } from "@/server/modules/checklist/checklist.queries";
import { countUnreadNotifications } from "@/server/modules/notifications/notifications.queries";

/** Authenticated application shell. Reading the session makes every page dynamic. */
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();
  const [unread, showChecklist] = await Promise.all([countUnreadNotifications(user.id), shouldShowChecklistToday(user.id)]);

  return (
    <ChecklistProvider autoOpen={showChecklist}>
      <div className="min-h-screen">
        <NavigationIntent />
        <LiveUpdates />
        <Suspense fallback={null}>
          <NavigationProgress />
        </Suspense>
        <Sidebar permissions={permissionsFor(user.role)} />
        <div className="lg:pl-64">
          <header className="sticky top-0 z-20 flex h-14 items-center justify-end gap-1 border-b border-slate-200 bg-white/90 px-4 backdrop-blur sm:px-6">
            <OpenChecklistButton />
            <NotificationBell unread={unread} />
            <span className="mx-1 h-6 w-px bg-slate-200" aria-hidden />
            <UserMenu name={user.name} roleLabel={ROLE_LABELS[user.role]} />
          </header>
          <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">{children}</main>
        </div>
      </div>
    </ChecklistProvider>
  );
}
