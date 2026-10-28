import { can } from "@/lib/permissions";
import type { CopilotAction, CopilotConfirmation } from "@/lib/copilot/types";
import { deriveAnchorFromRoute } from "@/lib/copilot/screen-anchor";
import { encodeCopilotEvent } from "@/lib/copilot/stream-events";
import { copilotChatSchema } from "@/lib/validation/copilot";
import { apiRoute } from "@/server/http/api-route";
import { logger } from "@/server/observability/logger";
import { getWorkspaceCounts } from "@/server/modules/copilot/copilot.queries";
import { answerFromKnowledge, buildLlmPrompt } from "@/server/modules/copilot/knowledge";
import { llmConfigured, streamChatCompletion } from "@/server/modules/copilot/llm";
import { copilotToolsForRole, describeCopilotToolCall, executeCopilotTool } from "@/server/modules/copilot/tools";
import { AutonomousAgentService } from "@/server/modules/copilot/agent.service";
import { checkDomainGuard } from "@/server/modules/copilot/guard";
import { shouldUseFastPath } from "@/server/modules/copilot/routing";
import { createHash } from "node:crypto";

const event = encodeCopilotEvent;

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

/** Appends the action and confirmation metadata after an upstream model stream finishes. */
function withFinalEvent(
  source: ReadableStream<Uint8Array>,
  actions: CopilotAction[],
  sources: string[],
  getConfirmation?: () => CopilotConfirmation | undefined,
): ReadableStream<Uint8Array> {
  const reader = source.getReader();
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { done, value } = await reader.read();
      if (done) {
        const confirmation = getConfirmation?.();
        const finalActions = confirmation ? [] : actions;
        controller.enqueue(event({ done: true, actions: finalActions, sources, confirmation }));
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
 * Runs multi-step tool calls against the live database and market data.
 * The LLM understands natural user intent, plans prerequisite steps, queries live data,
 * and proposes operational transactions with human-in-the-loop confirmation.
 * If the upstream provider is offline or exhausted, the Autonomous Agent Planner takes over.
 */
export const POST = apiRoute({ permission: "dashboard.view", body: copilotChatSchema }, async ({ body, user, request }) => {
  // Older clients (and any non-browser caller) may not send an anchor; the URL
  // still identifies the record on every detail screen.
  const anchor = body.context.anchor ?? deriveAnchorFromRoute(body.context.route) ?? undefined;
  const context = { ...body.context, anchor, role: user.role, userId: user.id };
  const counts = await getWorkspaceCounts();
  const curated = answerFromKnowledge(body.message, context, counts);
  const actions = allowedActions(curated.actions, user.role);

  const actor = {
    userId: user.id,
    role: user.role,
    ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "127.0.0.1",
    userAgent: request.headers.get("user-agent") || undefined,
  };

  // 0. Domain Guardrail: Reject off-topic inquiries (e.g. general programming, code generation, non-business trivia)
  const guard = checkDomainGuard(body.message);
  if (guard.blocked) {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        // Must use the same {delta} / {done} shape as every other path: the
        // browser ignores anything else, so a refusal sent as {type:"token"}
        // left the user watching an empty bubble spin.
        controller.enqueue(event({ delta: guard.refusalText || "This topic is outside the Margix enterprise domain." }));
        controller.enqueue(event({ done: true, actions: [], sources: ["Margix Enterprise Guardrail"] }));
        controller.close();
      },
    });
    return sse(stream);
  }

  // 1. Pending confirmation replies (e.g. user says "yes / confirm / ha / cancel") must execute directly
  const isPendingReply = AutonomousAgentService.isPendingConfirmationReply(body.message, body.history);

  if (isPendingReply || !llmConfigured()) {
    return sse(AutonomousAgentService.executeAutonomousAgentStream(body.message, context, actor, body.history));
  }

  // 2. Tier 1 fast path. A plain lookup ("what suppliers do we have?") is
  // rendered deterministically from the database: no provider round trip, so no
  // latency, no tokens, and no chance of the model editorialising over data it
  // did not change. Anything analytical or mid-conversation skips this.
  const { intent } = AutonomousAgentService.planIntent(body.message, context, body.history);
  if (shouldUseFastPath(body.message, intent, body.history.length)) {
    logger.debug("copilot fast path", { intent, route: context.route });
    return sse(AutonomousAgentService.executeAutonomousAgentStream(body.message, context, actor, body.history));
  }

  let proposedConfirmation: CopilotConfirmation | undefined;

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
      tools: copilotToolsForRole(user.role, body.message, context.route),
      describeTool: describeCopilotToolCall,
      executeTool: (name, args) =>
        executeCopilotTool(name, args, {
          role: user.role,
          route: context.route,
          userId: user.id,
          onProposeConfirmation: (c) => {
            proposedConfirmation = c;
          },
        }),
      sessionId: createHash("sha256").update(`copilot:${user.id}`).digest("hex").slice(0, 24),
    });
    return sse(withFinalEvent(upstream, actions, curated.sources, () => proposedConfirmation));
  } catch (error) {
    const errText = error instanceof Error ? error.message : String(error);
    logger.warn("copilot llm unavailable; engaging autonomous database agent", {
      err: errText,
    });
    const isIpRestriction = /ip address restriction|ip.*blocked|ip_address_blocked/i.test(errText);
    const isFundsIssue = /insufficient.*funds|402|prepayment.*depleted|quota/i.test(errText);
    const llmNotice = isIpRestriction
      ? "Google Gemini API key has an IP address restriction enabled in Google Cloud Console. In Credentials settings, change Application Restrictions to 'None' to enable direct calls. Running Margix Autonomous Deep Research & DB Engine directly with live market data."
      : isFundsIssue
        ? "The configured AI provider has insufficient credit or exhausted its quota. Running the Margix Autonomous Deep Research & DB Engine directly with live market data."
        : undefined;
    // Seamlessly execute via Autonomous Multi-Step Agent using live database tools
    return sse(AutonomousAgentService.executeAutonomousAgentStream(body.message, context, actor, body.history, llmNotice));
  }
});
