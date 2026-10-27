import { copilotConfirmExecutionSchema } from "@/lib/validation/copilot";
import { apiRoute } from "@/server/http/api-route";
import { AutonomousAgentService } from "@/server/modules/copilot/agent.service";

/**
 * Handles explicit confirmation decisions for state-altering and destructive
 * operations proposed by the autonomous Copilot agent.
 */
export const POST = apiRoute(
  { permission: "dashboard.view", body: copilotConfirmExecutionSchema },
  async ({ body, user, request }) => {
    const actor = {
      userId: user.id,
      role: user.role,
      ipAddress: request.headers.get("x-forwarded-for") ?? null,
      userAgent: request.headers.get("user-agent") ?? null,
    };

    const result = await AutonomousAgentService.executeConfirmation(actor, {
      confirmationId: body.confirmationId,
      actionType: body.actionType,
      payload: body.payload,
      decision: body.decision,
      alternativeAction: body.alternativeAction,
      reason: body.reason,
    });

    return result;
  },
);
