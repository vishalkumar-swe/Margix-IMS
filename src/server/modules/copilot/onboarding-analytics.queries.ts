import type { RoleCode } from "@prisma/client";
import { prisma } from "@/server/db/client";
import { MILESTONES, visibleMilestones } from "@/lib/copilot/tour";

export interface UserOnboardingProgress {
  userId: string;
  name: string;
  email: string;
  role: RoleCode;
  lastLoginAt: Date | null;
  completedMilestones: string[];
  totalMilestones: number;
  percentage: number;
  status: "COMPLETED" | "IN_PROGRESS" | "NOT_STARTED";
  completedAt?: Date | null;
}

export interface RoleOnboardingStats {
  role: RoleCode;
  roleName: string;
  totalMembers: number;
  completedMembers: number;
  inProgressMembers: number;
  notStartedMembers: number;
  completionRate: number;
}

export interface MilestoneFunnelStep {
  id: string;
  number: number;
  title: string;
  category: string;
  completedCount: number;
  completionRate: number;
  dropOffRate: number;
}

export interface OnboardingAnalyticsSummary {
  totalUsers: number;
  completedUsers: number;
  overallCompletionRate: number;
  averageDaysToComplete: number;
  roles: RoleOnboardingStats[];
  funnel: MilestoneFunnelStep[];
  teamMembers: UserOnboardingProgress[];
}

const ROLE_DISPLAY_NAMES: Record<RoleCode, string> = {
  ADMIN: "System Administrator",
  STORE_MANAGER: "Store Manager",
  WAREHOUSE_OPERATOR: "Warehouse Operator",
  ACCOUNTS: "Accounts & Billing",
  MANAGEMENT: "Executive Management",
};

export async function getOnboardingAnalytics(): Promise<OnboardingAnalyticsSummary> {
  const [users, auditLogs] = await Promise.all([
    prisma.user.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        email: true,
        lastLoginAt: true,
        createdAt: true,
        role: { select: { code: true } },
      },
      orderBy: { name: "asc" },
    }),
    prisma.auditLog.findMany({
      where: {
        action: {
          in: ["COPILOT_MILESTONE_COMPLETED", "COPILOT_TOUR_COMPLETED"],
        },
      },
      select: {
        userId: true,
        action: true,
        entityId: true,
        createdAt: true,
      },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  // Map user milestones
  const userMilestoneMap = new Map<string, Set<string>>();
  const userCompletedDates = new Map<string, Date>();

  for (const log of auditLogs) {
    if (!log.userId) continue;
    if (log.action === "COPILOT_MILESTONE_COMPLETED" && log.entityId) {
      const set = userMilestoneMap.get(log.userId) ?? new Set<string>();
      set.add(log.entityId);
      userMilestoneMap.set(log.userId, set);
    } else if (log.action === "COPILOT_TOUR_COMPLETED") {
      userCompletedDates.set(log.userId, log.createdAt);
    }
  }

  // Calculate per user progress
  const teamMembers: UserOnboardingProgress[] = users.map((u) => {
    const roleCode = u.role.code;
    const requiredMilestones = visibleMilestones(roleCode);
    const completedSet = userMilestoneMap.get(u.id) ?? new Set<string>();
    const tourCompleted = userCompletedDates.has(u.id);

    // Finishing the guided tour certifies every milestone the role can see;
    // otherwise count the milestone events recorded by the progress route.
    const completedList = requiredMilestones
      .map((m) => m.id)
      .filter((id) => tourCompleted || completedSet.has(id));

    const total = requiredMilestones.length || 1;
    const count = completedList.length;
    const percentage = Math.round((count / total) * 100);

    let status: "COMPLETED" | "IN_PROGRESS" | "NOT_STARTED" = "NOT_STARTED";
    if (percentage === 100 || tourCompleted) {
      status = "COMPLETED";
    } else if (percentage > 0) {
      status = "IN_PROGRESS";
    }

    return {
      userId: u.id,
      name: u.name,
      email: u.email,
      role: roleCode,
      lastLoginAt: u.lastLoginAt,
      completedMilestones: completedList,
      totalMilestones: total,
      percentage: status === "COMPLETED" ? 100 : percentage,
      status,
      completedAt: userCompletedDates.get(u.id) ?? null,
    };
  });

  // Role aggregation
  const roleGroups = new Map<RoleCode, UserOnboardingProgress[]>();
  for (const member of teamMembers) {
    const list = roleGroups.get(member.role) ?? [];
    list.push(member);
    roleGroups.set(member.role, list);
  }

  const roles: RoleOnboardingStats[] = (["ADMIN", "STORE_MANAGER", "WAREHOUSE_OPERATOR", "ACCOUNTS", "MANAGEMENT"] as RoleCode[])
    .map((roleCode) => {
      const members = roleGroups.get(roleCode) ?? [];
      const total = members.length;
      const completed = members.filter((m) => m.status === "COMPLETED").length;
      const inProgress = members.filter((m) => m.status === "IN_PROGRESS").length;
      const notStarted = members.filter((m) => m.status === "NOT_STARTED").length;
      const completionRate = total > 0 ? Math.round((completed / total) * 100) : 100;

      return {
        role: roleCode,
        roleName: ROLE_DISPLAY_NAMES[roleCode] ?? roleCode,
        totalMembers: total,
        completedMembers: completed,
        inProgressMembers: inProgress,
        notStartedMembers: notStarted,
        completionRate,
      };
    })
    .filter((r) => r.totalMembers > 0);

  // Milestone Funnel
  let previousCount = teamMembers.length || 1;
  const funnel: MilestoneFunnelStep[] = MILESTONES.map((milestone) => {
    const completedCount = teamMembers.filter((m) => m.completedMilestones.includes(milestone.id) || m.status === "COMPLETED").length;
    const totalUsers = teamMembers.length || 1;
    const completionRate = Math.round((completedCount / totalUsers) * 100);
    const dropOffRate = previousCount > 0 ? Math.max(0, Math.round(((previousCount - completedCount) / previousCount) * 100)) : 0;
    previousCount = completedCount;

    return {
      id: milestone.id,
      number: milestone.order,
      title: milestone.title,
      category: milestone.shortTitle,
      completedCount,
      completionRate,
      dropOffRate,
    };
  });

  const totalUsers = teamMembers.length;
  const completedUsers = teamMembers.filter((m) => m.status === "COMPLETED").length;
  const overallCompletionRate = totalUsers > 0 ? Math.round((completedUsers / totalUsers) * 100) : 0;
  const completionDays = users.flatMap((user) => {
    const completedAt = userCompletedDates.get(user.id);
    if (!completedAt) return [];
    return [Math.max(0, (completedAt.getTime() - user.createdAt.getTime()) / 86_400_000)];
  });
  const averageDaysToComplete =
    completionDays.length > 0
      ? Math.round((completionDays.reduce((sum, days) => sum + days, 0) / completionDays.length) * 10) / 10
      : 0;

  return {
    totalUsers,
    completedUsers,
    overallCompletionRate,
    averageDaysToComplete,
    roles,
    funnel,
    teamMembers,
  };
}
