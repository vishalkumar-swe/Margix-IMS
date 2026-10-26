import { z } from "zod";
import { apiRoute } from "@/server/http/api-route";
import { prisma } from "@/server/db/client";
import { recordAudit } from "@/server/modules/audit/audit.service";
import { MILESTONE_BY_ID } from "@/lib/copilot/tour";

const progressSchema = z.object({
  milestoneId: z.string().optional(),
  tourCompleted: z.boolean().optional(),
});

export const POST = apiRoute(
  {
    permission: "dashboard.view",
    body: progressSchema,
  },
  async ({ actor, body }) => {
    if (body.milestoneId && MILESTONE_BY_ID.has(body.milestoneId)) {
      await recordAudit(prisma, actor, {
        action: "COPILOT_MILESTONE_COMPLETED",
        entityType: "TourMilestone",
        entityId: body.milestoneId,
        newData: { milestone: body.milestoneId, timestamp: new Date().toISOString() },
      });
    }

    if (body.tourCompleted) {
      await recordAudit(prisma, actor, {
        action: "COPILOT_TOUR_COMPLETED",
        entityType: "TourCompletion",
        entityId: actor.userId,
        newData: { completedAt: new Date().toISOString() },
      });
    }

    return { ok: true };
  },
);
