import { can } from "@/lib/permissions";
import type { CopilotAction } from "@/lib/copilot/types";
import { copilotChatSchema } from "@/lib/validation/copilot";
import { apiRoute } from "@/server/http/api-route";
import { logger } from "@/server/observability/logger";
import { getWorkspaceCounts } from "@/server/modules/copilot/copilot.queries";
import { answerFromKnowledge, buildLlmPrompt } from "@/server/modules/copilot/knowledge";
import { llmConfigured, streamChatCompletion } from "@/server/modules/copilot/llm";
import { copilotToolsForRole, executeCopilotTool } from "@/server/modules/copilot/tools";
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

/** Streams a curated answer in small chunks so the UI renders progressively offline too. */
function textStream(text: string, actions: CopilotAction[], sources: string[]): ReadableStream<Uint8Array> {
  let offset = 0;
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (offset >= text.length) {
        controller.enqueue(event({ done: true, actions, sources }));
        controller.close();
        return;
      }
      const size = 18 + Math.floor(Math.random() * 18);
      const delta = text.slice(offset, offset + size);
      offset += size;
      controller.enqueue(event({ delta }));
      await new Promise((resolve) => setTimeout(resolve, 8));
    },
  });
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
 * Contextual Copilot answer. Offline by default (curated retrieval); streams
 * from an OpenAI-compatible model when AI_PROVIDER=openai and a key is set.
 * The server owns the role, so a spoofed browser context cannot widen access.
 */
export const POST = apiRoute({ permission: "dashboard.view", body: copilotChatSchema }, async ({ body, user, request }) => {
  const context = { ...body.context, role: user.role };
  const counts = await getWorkspaceCounts();
  const curated = answerFromKnowledge(body.message, context, counts);
  const actions = allowedActions(curated.actions, user.role);

  if (!llmConfigured()) {
    return sse(textStream(curated.answer, actions, curated.sources));
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
    logger.warn("copilot llm unavailable; using offline answer", {
      err: error instanceof Error ? error.message : String(error),
    });
    const errText = error instanceof Error ? error.message : String(error);
    const isOpenCodeFunds = errText.toLowerCase().includes("insufficient account funds") || errText.includes("402");
    const note = isOpenCodeFunds
      ? "\n\n_Note: OpenCode account funds are currently exhausted. Answering from the built-in Margix knowledge base._"
      : "\n\nThe AI model is unavailable right now, so this answer comes from the built-in Margix knowledge base.";
    return sse(textStream(`${curated.answer}${note}`, actions, curated.sources));
  }
});
