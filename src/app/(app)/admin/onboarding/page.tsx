import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { requirePagePermission } from "@/server/auth/current-user";
import { getOnboardingAnalytics } from "@/server/modules/copilot/onboarding-analytics.queries";
import { getSandboxStatus } from "@/server/modules/copilot/sandbox.service";
import { AdminOnboardingView } from "@/features/copilot/admin-onboarding-view";

export const metadata: Metadata = {
  title: "Onboarding & Walkthrough Analytics",
  description: "Track team member certification velocity, milestone completion rates, and sandbox environments.",
};

export default async function AdminOnboardingPage() {
  await requirePagePermission("user.manage");

  const [analytics, sandbox] = await Promise.all([
    getOnboardingAnalytics(),
    getSandboxStatus(),
  ]);

  return (
    <>
      <PageHeader
        title="Onboarding & Training Analytics"
        description="Monitor staff walkthrough completion velocity, detect training drop-offs, and manage test data sandboxes."
      />
      <AdminOnboardingView initialAnalytics={analytics} initialSandbox={sandbox} />
    </>
  );
}
