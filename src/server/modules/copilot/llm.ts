import { getEnv } from "@/server/config/env";
import { encodeCopilotEvent, type CopilotStreamEvent } from "@/lib/copilot/stream-events";

/** True when the Copilot should stream from a configured OpenAI-compatible or Google Gemini endpoint. */
export function llmConfigured(): boolean {
  const env = getEnv();
  if (env.AI_PROVIDER === "openai") return Boolean(env.AI_API_KEY);
  if (env.AI_PROVIDER === "google" || env.AI_PROVIDER === "gemini") {
    return Boolean(env.GEMINI_API_KEY || env.AI_API_KEY);
  }
  return false;
}

export function getActiveLlmConfig(sessionId?: string): CompletionConfig {
  const env = getEnv();
  const provider = env.AI_PROVIDER;

  if (provider === "google" || provider === "gemini") {
    const apiKey = env.GEMINI_API_KEY || env.AI_API_KEY || "";
    const model =
      env.AI_MODEL.startsWith("gemini") && env.AI_MODEL !== "gemini-1.5-flash"
        ? env.AI_MODEL
        : "gemini-2.5-flash";
    return {
      baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
      apiKey,
      model,
      timeoutMs: env.AI_TIMEOUT_MS,
      sessionId,
    };
  }

  return {
    baseUrl: env.AI_BASE_URL,
    apiKey: env.AI_API_KEY ?? "",
    model: env.AI_MODEL,
    timeoutMs: env.AI_TIMEOUT_MS,
    sessionId,
  };
}

export interface LlmToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
  extra_content?: Record<string, unknown>;
}

export interface LlmTool {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface LlmMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  /** Present on an assistant message that requested tools. */
  tool_calls?: LlmToolCall[];
  /** Present on a `tool` message, linking it to the call it answers. */
  tool_call_id?: string;
}

export type LlmToolExecutor = (name: string, argumentsJson: string) => Promise<string>;

/** Human-readable label for one tool call, shown in the live progress stepper. */
export interface ToolStepDescriptor {
  name: string;
  tool: string;
  description?: string;
}

export type ToolDescriber = (name: string, argumentsJson: string) => ToolStepDescriptor;

export interface CompletionConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  timeoutMs: number;
  sessionId?: string;
}

interface StreamOptions {
  config: CompletionConfig;
  messages: LlmMessage[];
  signal?: AbortSignal;
  tools?: LlmTool[];
  executeTool?: LlmToolExecutor;
  /** Labels tool calls so the browser can show what the agent is doing. */
  describeTool?: ToolDescriber;
}

/**
 * How many times the model may look at tool output and decide to act again.
 * Each round is a full provider call that re-sends the prompt and every tool
 * schema, so this is the main lever on cost: high enough for the agent to
 * finish a multi-step goal on its own, low enough to bound a runaway loop.
 */
const MAX_TOOL_ROUNDS = 6;
const MAX_TOKENS = 2048;

/**
 * Cap on one tool result fed back to the model. Without it a single wide list
 * can dominate the context of every remaining round.
 */
const MAX_TOOL_RESULT_CHARS = 6000;

/**
 * Whole-turn ceiling on what we send upstream, summed across rounds. Round
 * count alone does not bound cost — a wide tool list plus accumulated results
 * does — so when the budget is spent the tools are withdrawn and the model
 * answers from what it already has.
 */
const MAX_TURN_PROMPT_CHARS = 120_000;

function promptSize(messages: LlmMessage[], tools: LlmTool[] | undefined): number {
  let size = 0;
  for (const message of messages) size += (message.content?.length ?? 0) + 40;
  for (const tool of tools ?? []) size += JSON.stringify(tool).length;
  return size;
}

function trimToolResult(output: string): string {
  if (output.length <= MAX_TOOL_RESULT_CHARS) return output;
  return `${output.slice(0, MAX_TOOL_RESULT_CHARS)}\n…[truncated; narrow the query or ask for fewer rows]`;
}

/** One line about what a tool returned, for the live progress stepper. */
function summarizeToolResult(output: string): string {
  try {
    const parsed = JSON.parse(output) as unknown;
    if (Array.isArray(parsed)) return `${parsed.length} row(s)`;
    if (parsed && typeof parsed === "object") {
      const record = parsed as Record<string, unknown>;
      if (typeof record.error === "string") return record.error.slice(0, 160);
      const list = Object.values(record).find((value) => Array.isArray(value));
      if (Array.isArray(list)) return `${list.length} row(s)`;
      if (typeof record.count === "number") return `${record.count} row(s)`;
      return `${Object.keys(record).length} field(s)`;
    }
  } catch {
    // Not JSON — fall through to a length hint.
  }
  return output.length > 0 ? `${output.length} characters` : "no data";
}

type ToolSettled = (index: number, ok: boolean, summary: string) => void;

/**
 * Runs the tools one round requested. The model asks for independent lookups
 * in the same round, so they run concurrently — serial execution made a
 * three-lookup round three round-trips long for no reason. Each call reports
 * as it settles rather than at the end, so a slow one does not hold back the
 * progress the user can already see.
 */
async function runToolCalls(
  calls: LlmToolCall[],
  executeTool: LlmToolExecutor,
  onSettled?: ToolSettled,
): Promise<LlmMessage[]> {
  const outputs = await Promise.all(
    calls.map(async (call, index) => {
      try {
        const output = trimToolResult(await executeTool(call.function.name, call.function.arguments));
        onSettled?.(index, true, summarizeToolResult(output));
        return output;
      } catch (error) {
        // A failed tool is data the model can recover from, not a dead stream.
        const message = error instanceof Error ? error.message : "Tool execution failed.";
        onSettled?.(index, false, message);
        return JSON.stringify({ error: message });
      }
    }),
  );
  return calls.map((call, index) => ({ role: "tool", tool_call_id: call.id, content: outputs[index] }));
}

/**
 * Keeps the system prompt plus a bounded tail of the conversation. The tail has
 * to be wide enough to hold several agent rounds (one assistant message plus
 * its tool results each), but long histories cost more and dilute the retrieved
 * excerpts, so it is re-applied on every round rather than allowed to grow.
 */
function clampHistory(messages: LlmMessage[], keep = 24): LlmMessage[] {
  const system = messages.filter((message) => message.role === "system");
  const turns = messages.filter((message) => message.role !== "system").slice(-keep);
  // Never start with an orphaned tool result.
  while (turns[0]?.role === "tool") turns.shift();
  return [...system, ...turns];
}

interface OpenAiChunk {
  choices?: {
    delta?: {
      content?: string | null;
      tool_calls?: {
        index?: number;
        id?: string;
        type?: string;
        function?: { name?: string; arguments?: string };
        extra_content?: Record<string, unknown>;
      }[];
    };
    finish_reason?: string | null;
  }[];
  error?: { message?: string };
}

class ProviderError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

interface OpenRound {
  reader: ReadableStreamDefaultReader<Uint8Array>;
  decoder: TextDecoder;
  cleanup: () => void;
  abort: () => void;
}

interface RoundResult {
  toolCalls: LlmToolCall[];
  content: string;
}

function requestBody(messages: LlmMessage[], tools: LlmTool[] | undefined, model: string) {
  return {
    model,
    stream: true,
    temperature: 0.2,
    max_tokens: MAX_TOKENS,
    messages,
    ...(tools && tools.length > 0 ? { tools, tool_choice: "auto" } : {}),
  };
}

/** Opens one streaming completion. Network/HTTP failures throw before any bytes are sent. */
async function openRound(
  messages: LlmMessage[],
  tools: LlmTool[] | undefined,
  config: CompletionConfig,
  externalSignal: AbortSignal | undefined,
): Promise<OpenRound> {
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  externalSignal?.addEventListener("abort", onAbort, { once: true });
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);
  const cleanup = () => {
    clearTimeout(timer);
    externalSignal?.removeEventListener("abort", onAbort);
  };

  let response: Response;
  try {
    response = await fetch(`${config.baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${config.apiKey}`,
        "user-agent": "margix-ims-copilot/1.0",
        ...(config.sessionId ? { "x-opencode-session": config.sessionId } : {}),
      },
      body: JSON.stringify(requestBody(messages, tools, config.model)),
      signal: controller.signal,
    });
  } catch (error) {
    cleanup();
    throw error;
  }

  if (!response.ok || !response.body) {
    const detail = await response.text().catch(() => "");
    cleanup();
    throw new ProviderError(
      `AI provider returned ${response.status}${detail ? `: ${detail.slice(0, 300)}` : ""}`,
      response.status,
    );
  }

  return {
    reader: response.body.getReader(),
    decoder: new TextDecoder(),
    cleanup,
    abort: () => controller.abort(),
  };
}

interface ParsedLine {
  done?: boolean;
  error?: string;
  content?: string;
  toolCalls?: NonNullable<NonNullable<OpenAiChunk["choices"]>[number]["delta"]>["tool_calls"];
}

function parseStreamLine(line: string): ParsedLine | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith("data:")) return null;
  const payload = trimmed.slice(5).trim();
  if (!payload) return null;
  if (payload === "[DONE]") return { done: true };
  try {
    const chunk = JSON.parse(payload) as OpenAiChunk;
    if (chunk.error?.message) return { error: chunk.error.message };
    const delta = chunk.choices?.[0]?.delta;
    const content = typeof delta?.content === "string" ? delta.content : undefined;
    return { content, toolCalls: delta?.tool_calls };
  } catch {
    // A malformed provider chunk should not kill an otherwise good answer.
    return null;
  }
}

function accumulateToolCalls(calls: Map<number, LlmToolCall>, deltas: ParsedLine["toolCalls"]): void {
  for (const delta of deltas ?? []) {
    const index = delta.index ?? 0;
    const existing = calls.get(index) ?? {
      id: "",
      type: "function" as const,
      function: { name: "", arguments: "" },
    };
    if (delta.id) existing.id = delta.id;
    if (delta.function?.name) existing.function.name = delta.function.name;
    if (delta.function?.arguments) existing.function.arguments += delta.function.arguments;
    if (delta.extra_content) {
      existing.extra_content = {
        ...(existing.extra_content ?? {}),
        ...delta.extra_content,
      };
    }
    calls.set(index, existing);
  }
}

/** Consumes one provider stream, forwarding text deltas and collecting tool calls. */
async function consumeRound(round: OpenRound, onDelta: (delta: string) => void): Promise<RoundResult> {
  const calls = new Map<number, LlmToolCall>();
  let content = "";
  let buffer = "";
  let finished = false;

  const handleLine = (line: string) => {
    const parsed = parseStreamLine(line);
    if (!parsed) return;
    if (parsed.error) throw new Error(parsed.error);
    if (parsed.done) {
      finished = true;
      return;
    }
    if (parsed.content) {
      content += parsed.content;
      onDelta(parsed.content);
    }
    accumulateToolCalls(calls, parsed.toolCalls);
  };

  try {
    while (!finished) {
      const { done, value } = await round.reader.read();
      if (done) break;
      buffer += round.decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) handleLine(line);
    }
    if (!finished && buffer.trim()) handleLine(buffer);
  } finally {
    round.cleanup();
  }

  const toolCalls = [...calls.entries()]
    .sort(([a], [b]) => a - b)
    .map(([index, call]) => (call.id ? call : { ...call, id: `call_${index}` }))
    .filter((call) => call.function.name.length > 0);

  return { toolCalls, content };
}

function isToolsUnsupported(error: unknown): boolean {
  return error instanceof ProviderError && (error.status === 400 || error.status === 422);
}

/**
 * Streams a full Copilot answer with optional server-side tool use. The model
 * may request read-only tools for up to three rounds; their output is appended
 * as `tool` messages and the model then answers. Text is emitted as
 * `data: {"delta":"..."}` events. Network/HTTP failures before the first byte
 * are thrown so the route can fall back to the curated answer.
 */
export async function streamCompletion(options: StreamOptions): Promise<ReadableStream<Uint8Array>> {
  const initialMessages = clampHistory(options.messages);
  let tools = options.tools && options.tools.length > 0 ? options.tools : undefined;

  const open = async (messages: LlmMessage[], currentTools: LlmTool[] | undefined) => {
    try {
      return await openRound(messages, currentTools, options.config, options.signal);
    } catch (error) {
      // Some OpenAI-compatible models reject the `tools` field. Retry the same
      // turn without tools rather than losing the answer entirely.
      if (currentTools && isToolsUnsupported(error)) {
        tools = undefined;
        return openRound(messages, undefined, options.config, options.signal);
      }
      throw error;
    }
  };

  let activeRound = await open(initialMessages, tools);

  return new ReadableStream<Uint8Array>({
    async start(streamController) {
      const send = (payload: CopilotStreamEvent) => {
        try {
          streamController.enqueue(encodeCopilotEvent(payload));
        } catch {
          // The reader went away; stop writing.
        }
      };

      try {
        let messages = initialMessages;
        let currentTools = tools;
        let round = activeRound;
        let toolRounds = 0;
        let spent = promptSize(messages, currentTools);
        // Cumulative stepper shown in the browser. The plan is discovered a
        // round at a time, so it grows rather than arriving complete.
        const steps: Array<ToolStepDescriptor & { status: "pending" | "running" | "completed" | "failed"; outputSummary?: string }> = [];

        while (true) {
          const result = await consumeRound(round, (delta) => send({ delta }));

          if (result.toolCalls.length === 0 || !currentTools || !options.executeTool) break;

          const offset = steps.length;
          for (const call of result.toolCalls) {
            const described = options.describeTool?.(call.function.name, call.function.arguments);
            steps.push({
              name: described?.name ?? call.function.name,
              tool: described?.tool ?? call.function.name,
              description: described?.description,
              status: "running",
            });
          }
          send({
            type: "plan",
            thinking:
              toolRounds === 0
                ? "Reading live Margix data to answer this."
                : `Reviewing what came back and continuing (step ${toolRounds + 1}).`,
            steps: steps.map((step) => ({ ...step })),
          });

          const toolMessages = await runToolCalls(result.toolCalls, options.executeTool, (index, ok, summary) => {
            const step = steps[offset + index];
            if (!step) return;
            step.status = ok ? "completed" : "failed";
            step.outputSummary = summary;
            send({ type: "step", stepIndex: offset + index, status: step.status, outputSummary: summary });
          });

          messages = clampHistory([
            ...messages,
            { role: "assistant", content: result.content || null, tool_calls: result.toolCalls },
            ...toolMessages,
          ]);
          toolRounds += 1;
          spent += promptSize(messages, currentTools);
          const withinBudget = toolRounds < MAX_TOOL_ROUNDS && spent < MAX_TURN_PROMPT_CHARS;
          currentTools = withinBudget ? tools : undefined;
          round = await open(messages, currentTools);
          activeRound = round;
        }

        streamController.close();
      } catch (error) {
        if (!options.signal?.aborted) {
          send({ error: error instanceof Error ? error.message : "The AI provider failed." });
        }
        streamController.close();
      }
    },
    cancel() {
      activeRound.cleanup();
      activeRound.abort();
    },
  });
}

/** Streams from the environment-configured provider. */
export async function streamChatCompletion(options: {
  messages: LlmMessage[];
  signal?: AbortSignal;
  tools?: LlmTool[];
  executeTool?: LlmToolExecutor;
  describeTool?: ToolDescriber;
  sessionId?: string;
}): Promise<ReadableStream<Uint8Array>> {
  const { sessionId, ...rest } = options;
  return streamCompletion({
    config: getActiveLlmConfig(sessionId),
    ...rest,
  });
}

/**
 * Executes a full non-streaming chat completion with automated tool invocation rounds.
 * Returns the final content, collected tool calls, and execution rounds.
 */
export async function executeLlmChat(options: {
  messages: LlmMessage[];
  tools?: LlmTool[];
  executeTool?: LlmToolExecutor;
  signal?: AbortSignal;
  sessionId?: string;
  maxRounds?: number;
}): Promise<{ content: string; toolCalls: LlmToolCall[]; toolRounds: number }> {
  const config = getActiveLlmConfig(options.sessionId);
  const maxRounds = options.maxRounds ?? MAX_TOOL_ROUNDS;
  let messages = clampHistory(options.messages);
  let currentTools = options.tools && options.tools.length > 0 ? options.tools : undefined;
  let toolRounds = 0;
  let spent = promptSize(messages, currentTools);
  const allToolCalls: LlmToolCall[] = [];
  let finalContent = "";

  while (true) {
    const round = await openRound(messages, currentTools, config, options.signal);
    const result = await consumeRound(round, () => {});
    finalContent = result.content;
    allToolCalls.push(...result.toolCalls);

    if (result.toolCalls.length === 0 || !currentTools || !options.executeTool || toolRounds >= maxRounds) {
      break;
    }

    const toolMessages = await runToolCalls(result.toolCalls, options.executeTool);

    messages = clampHistory([
      ...messages,
      { role: "assistant", content: result.content || null, tool_calls: result.toolCalls },
      ...toolMessages,
    ]);
    toolRounds += 1;
    spent += promptSize(messages, currentTools);
    currentTools = toolRounds < maxRounds && spent < MAX_TURN_PROMPT_CHARS ? options.tools : undefined;
  }

  return { content: finalContent, toolCalls: allToolCalls, toolRounds };
}

/** Parses `data:` events from our own SSE response. */
export function parseSseLine(line: string): { delta?: string; error?: string; done?: boolean } | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith("data:")) return null;
  const payload = trimmed.slice(5).trim();
  if (payload === "[DONE]") return { done: true };
  try {
    return JSON.parse(payload) as { delta?: string; error?: string; done?: boolean };
  } catch {
    return null;
  }
}
