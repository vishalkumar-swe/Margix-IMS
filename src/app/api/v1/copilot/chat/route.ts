import { can } from "@/lib/permissions";
import type { CopilotAction } from "@/lib/copilot/types";
import { copilotChatSchema } from "@/lib/validation/copilot";
import { apiRoute } from "@/server/http/api-route";
import { logger } from "@/server/observability/logger";
import { getWorkspaceCounts } from "@/server/modules/copilot/copilot.queries";
import { answerFromKnowledge, buildLlmPrompt } from "@/server/modules/copilot/knowledge";
import { llmConfigured, streamChatCompletion } from "@/server/modules/copilot/llm";
import { copilotToolsForRole, executeCopilotTool } from "@/server/modules/copilot/tools";
import { AutonomousAgentService } from "@/server/modules/copilot/agent.service";
import { createHash } from "node:crypto";

const encoder = new TextEncoder();
const event = (payload: unknown) => encoder.encode(`data: ${JSON.stringify(payload)}\n\n`);

function sse(stream: ReadableStream<Uint8Array>): Response {
  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}

function allowedActions(actions: CopilotAction[], role: Parameters<typeof can>[0]): CopilotAction[] {
  return actions.filter((action) => !action.permission || can(role, action.permission));
}

/** Appends the action metadata after an upstream model stream finishes. */
function withFinalEvent(
  source: ReadableStream<Uint8Array>,
  actions: CopilotAction[],
  sources: string[],
): ReadableStream<Uint8Array> {
  const reader = source.getReader();
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { done, value } = await reader.read();
      if (done) {
        controller.enqueue(event({ done: true, actions, sources }));
        controller.close();
        return;
      }
      controller.enqueue(value);
    },
    cancel() {
      void reader.cancel();
    },
  });
}

/**
 * Contextual Copilot & Autonomous Inventory Agent.
 * Runs multi-step tool calls against the live database. When AI_PROVIDER is active
 * and healthy, streams from the model with OpenAI function calling; if the upstream
 * provider is offline or exhausted, the Autonomous Agent Planner takes over
 * directly to execute multi-step database tool operations with live data.
 */
export const POST = apiRoute({ permission: "dashboard.view", body: copilotChatSchema }, async ({ body, user, request }) => {
  const context = { ...body.context, role: user.role };
  const counts = await getWorkspaceCounts();
  const curated = answerFromKnowledge(body.message, context, counts);
  const actions = allowedActions(curated.actions, user.role);

  const actor = {
    userId: user.id,
    role: user.role,
    ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "127.0.0.1",
    userAgent: request.headers.get("user-agent") || undefined,
  };

  // If message is an operational command (e.g. cancel, reverse, dispatch, short-close, seed/purge)
  // or a conversational reply to a pending confirmation card (yes, no, kardo, cancel),
  // dispatch directly to the autonomous agent engine with confirmation protocol & DB tools.
  if (AutonomousAgentService.isOperationalOrConfirmation(body.message, body.history) || !llmConfigured()) {
    return sse(AutonomousAgentService.executeAutonomousAgentStream(body.message, context, actor, body.history));
  }

  try {
    const { system } = buildLlmPrompt(body.message, context, counts);
    const messages = [
      { role: "system" as const, content: system },
      ...body.history.slice(-10).map((message) => ({ role: message.role, content: message.content })),
      { role: "user" as const, content: body.message },
    ];
    const upstream = await streamChatCompletion({
      messages,
      signal: request.signal,
      tools: copilotToolsForRole(user.role),
      executeTool: (name, args) => executeCopilotTool(name, args, { role: user.role, route: context.route }),
      sessionId: createHash("sha256").update(`copilot:${user.id}`).digest("hex").slice(0, 24),
    });
    return sse(withFinalEvent(upstream, actions, curated.sources));
  } catch (error) {
    logger.warn("copilot llm unavailable; engaging autonomous database agent", {
      err: error instanceof Error ? error.message : String(error),
    });
    // Seamlessly execute via Autonomous Multi-Step Agent using live database tools
    return sse(AutonomousAgentService.executeAutonomousAgentStream(body.message, context, actor, body.history));
  }
});
