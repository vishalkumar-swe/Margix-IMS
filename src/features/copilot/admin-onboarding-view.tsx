"use client";

import { useState } from "react";
import {
  AlertCircle,
  Award,
  CheckCircle2,
  Clock,
  Database,
  GraduationCap,
  Play,
  RotateCcw,
  Sparkles,
  TrendingUp,
  Users,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { useToast } from "@/components/ui/toast";
import { apiRequest } from "@/lib/api-client";
import type { OnboardingAnalyticsSummary } from "@/server/modules/copilot/onboarding-analytics.queries";
import type { SandboxStatus } from "@/server/modules/copilot/sandbox.service";

export function AdminOnboardingView({
  initialAnalytics,
  initialSandbox,
}: {
  initialAnalytics: OnboardingAnalyticsSummary;
  initialSandbox: SandboxStatus;
}) {
  const toast = useToast();
  const [analytics] = useState<OnboardingAnalyticsSummary>(initialAnalytics);
  const [sandbox, setSandbox] = useState<SandboxStatus>(initialSandbox);
  const [sandboxPending, setSandboxPending] = useState(false);

  async function handleSeedSandbox() {
    setSandboxPending(true);
    try {
      await apiRequest("/copilot/sandbox", { method: "POST" });
      const updated = await apiRequest<SandboxStatus>("/copilot/sandbox");
      setSandbox(updated);
      toast.success(
        `Sandbox ready: ${updated.demoStockBags} bags of demo stock and an open invoice are available.`,
      );
    } catch {
      toast.error("Failed to seed sandbox environment");
    } finally {
      setSandboxPending(false);
    }
  }

  async function handlePurgeSandbox() {
    if (!confirm("Are you sure you want to clean up all DEMO test data? Production records will not be touched.")) {
      return;
    }
    setSandboxPending(true);
    try {
      await apiRequest("/copilot/sandbox", { method: "DELETE" });
      const updated = await apiRequest<SandboxStatus>("/copilot/sandbox");
      setSandbox(updated);
      toast.success("Sandbox test data purged cleanly.");
    } catch {
      toast.error("Failed to purge sandbox data");
    } finally {
      setSandboxPending(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* KPI Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Team Completion Rate"
          value={`${analytics.overallCompletionRate}%`}
          icon={GraduationCap}
          hint={`${analytics.completedUsers} of ${analytics.totalUsers} certified team members`}
        />
        <StatCard
          label="Avg Time to Completion"
          value={`${analytics.averageDaysToComplete} Days`}
          icon={Clock}
          hint="From account creation to finishing the guided walkthrough"
        />
        <StatCard
          label="Certified Staff"
          value={analytics.completedUsers}
          icon={Award}
          hint="Completed every visible lifecycle milestone for their role"
        />
        <StatCard
          label="Sandbox Test Environment"
          value={sandbox.hasDemoData ? `Active (${sandbox.demoStockBags} Bags)` : "Clean"}
          icon={Database}
          tone={sandbox.hasDemoData ? "warning" : "neutral"}
          hint={sandbox.hasDemoData ? "Demo SKU, PO, GRN & Invoice loaded" : "No demo records in database"}
        />
      </div>

      {/* Sandbox Demo Management Card */}
      <Card className="border-brand-200 bg-gradient-to-r from-brand-50/70 via-white to-amber-50/40">
        <CardBody className="p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="flex size-7 items-center justify-center rounded-lg bg-brand-500 text-black">
                  <Database className="size-4" />
                </span>
                <h3 className="font-semibold text-slate-900">Enterprise Sandbox & Demo Mode (Phase 3)</h3>
                <Badge tone={sandbox.hasDemoData ? "warning" : "neutral"}>
                  {sandbox.hasDemoData ? "Sample Data Live" : "Standby"}
                </Badge>
              </div>
              <p className="text-sm text-slate-600 max-w-2xl">
                Deploy 1-click test data (Demo SKU, Godown, PO, GRN with 100 bags stock & open invoice) so new operators can
                safely test every milestone without affecting production numbers. Purge anytime with zero residue.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {sandbox.hasDemoData ? (
                <Button
                  variant="danger"
                  size="sm"
                  loading={sandboxPending}
                  onClick={handlePurgeSandbox}
                  className="gap-1.5"
                >
                  <RotateCcw className="size-3.5" />
                  Clean Up Demo Data
                </Button>
              ) : (
                <Button
                  variant="primary"
                  size="sm"
                  loading={sandboxPending}
                  onClick={handleSeedSandbox}
                  className="gap-1.5"
                >
                  <Play className="size-3.5" />
                  Seed Demo Sandbox
                </Button>
              )}
            </div>
          </div>
        </CardBody>
      </Card>

      {/* Funnel & Role Breakdown */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Milestone Funnel */}
        <Card className="lg:col-span-2">
          <CardHeader
            title="Milestone Funnel & Drop-off Analysis"
            description="Staff progression across the 6 core lifecycle milestones"
            actions={<TrendingUp className="size-4 text-brand-600" />}
          />
          <CardBody className="space-y-4 pt-1">
            {analytics.funnel.map((step) => (
              <div key={step.id} className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-slate-700">
                    M{step.number}: {step.title}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-slate-500">{step.completedCount} staff ({step.completionRate}%)</span>
                    {step.dropOffRate > 0 && (
                      <span className="rounded bg-rose-50 px-1 py-0.5 text-[10px] font-semibold text-rose-600">
                        -{step.dropOffRate}% drop
                      </span>
                    )}
                  </div>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-brand-500 transition-all duration-500"
                    style={{ width: `${step.completionRate}%` }}
                  />
                </div>
              </div>
            ))}
          </CardBody>
        </Card>

        {/* Role Certification Progress */}
        <Card>
          <CardHeader
            title="Role Breakdown"
            description="Walkthrough readiness by department"
            actions={<Users className="size-4 text-slate-400" />}
          />
          <CardBody className="space-y-4 pt-1">
            {analytics.roles.map((r) => (
              <div key={r.role} className="rounded-lg border border-slate-200/80 p-3 bg-white/50">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-semibold text-slate-800">{r.roleName}</span>
                  <span className="text-xs font-bold text-brand-700">{r.completionRate}%</span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100 mb-2">
                  <div
                    className="h-full rounded-full bg-emerald-500"
                    style={{ width: `${r.completionRate}%` }}
                  />
                </div>
                <div className="flex justify-between text-[11px] text-slate-500">
                  <span>{r.completedMembers} certified</span>
                  <span>{r.totalMembers} total</span>
                </div>
              </div>
            ))}
          </CardBody>
        </Card>
      </div>

      {/* Team Roster Table */}
      <Card>
        <CardHeader
          title="Team Member Training Status"
          description="Individual progress across guided walkthrough modules"
          actions={<Sparkles className="size-4 text-brand-600" />}
        />
        <CardBody className="p-0 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-y border-slate-200 bg-slate-50/75 text-xs font-semibold text-slate-600">
              <tr>
                <th className="py-3 px-4">Team Member</th>
                <th className="py-3 px-4">Role</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Progress</th>
                <th className="py-3 px-4">Milestones Done</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {analytics.teamMembers.map((member) => (
                <tr key={member.userId} className="hover:bg-slate-50/50">
                  <td className="py-3 px-4">
                    <p className="font-medium text-slate-900">{member.name}</p>
                    <p className="text-xs text-slate-500">{member.email}</p>
                  </td>
                  <td className="py-3 px-4">
                    <Badge tone="neutral">{member.role}</Badge>
                  </td>
                  <td className="py-3 px-4">
                    {member.status === "COMPLETED" ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                        <CheckCircle2 className="size-3" /> Certified
                      </span>
                    ) : member.status === "IN_PROGRESS" ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                        <Clock className="size-3" /> In Progress
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                        <AlertCircle className="size-3" /> Not Started
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-4 min-w-[140px]">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full rounded-full bg-brand-500"
                          style={{ width: `${member.percentage}%` }}
                        />
                      </div>
                      <span className="text-xs font-semibold tabular-nums text-slate-700">
                        {member.percentage}%
                      </span>
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    <span className="text-xs text-slate-600">
                      {member.completedMilestones.length} of {member.totalMilestones}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right">
                    {member.status !== "COMPLETED" ? (
                      <a
                        className={buttonVariants({ variant: "secondary", size: "sm" })}
                        href={`mailto:${member.email}?subject=${encodeURIComponent(
                          "Margix walkthrough reminder",
                        )}&body=${encodeURIComponent(
                          `Hi ${member.name}, please continue the Margix onboarding walkthrough when you have a moment.`,
                        )}`}
                      >
                        Email
                      </a>
                    ) : (
                      <span className="text-xs text-emerald-600 font-medium">Complete</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardBody>
      </Card>
    </div>
  );
}
