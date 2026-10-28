import { afterEach, describe, expect, it, vi } from "vitest";
import { streamCompletion } from "@/server/modules/copilot/llm";

const config = { baseUrl: "https://provider.test/v1", apiKey: "k", model: "m", timeoutMs: 5000 };

function sseResponse(chunks: string[]): Response {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  return new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } });
}

function toolCallRound(name: string, args: string): string[] {
  return [
    `data: ${JSON.stringify({
      choices: [{ delta: { tool_calls: [{ index: 0, id: "c1", function: { name, arguments: args } }] } }],
    })}\n\n`,
    "data: [DONE]\n\n",
  ];
}

function textRound(text: string): string[] {
  return [`data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`, "data: [DONE]\n\n"];
}

async function collect(stream: ReadableStream<Uint8Array>): Promise<Array<Record<string, unknown>>> {
  const events: Array<Record<string, unknown>> = [];
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data:")) continue;
      events.push(JSON.parse(line.slice(5).trim()) as Record<string, unknown>);
    }
  }
  return events;
}

afterEach(() => vi.unstubAllGlobals());

describe("streamCompletion progress events", () => {
  it("announces the tools it is running and reports each as it finishes", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(sseResponse(toolCallRound("list_suppliers", '{"limit":5}')))
      .mockResolvedValueOnce(sseResponse(textRound("Two suppliers.")));
    vi.stubGlobal("fetch", fetchMock);

    const events = await collect(
      await streamCompletion({
        config,
        messages: [{ role: "user", content: "list suppliers" }],
        tools: [{ type: "function", function: { name: "list_suppliers", description: "d", parameters: {} } }],
        executeTool: async () => JSON.stringify({ suppliers: [{ name: "A" }, { name: "B" }] }),
        describeTool: (name) => ({ name: "Suppliers", tool: name, description: "limit: 5" }),
      }),
    );

    const plan = events.find((event) => event.type === "plan");
    expect(plan).toBeDefined();
    expect(plan?.steps).toEqual([
      { name: "Suppliers", tool: "list_suppliers", description: "limit: 5", status: "running" },
    ]);

    const step = events.find((event) => event.type === "step");
    expect(step).toMatchObject({ stepIndex: 0, status: "completed", outputSummary: "2 row(s)" });

    expect(events.filter((event) => typeof event.delta === "string").map((event) => event.delta).join("")).toBe(
      "Two suppliers.",
    );
  });

  it("marks a failed tool as failed and keeps the answer streaming", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(sseResponse(toolCallRound("check_stock", "{}")))
      .mockResolvedValueOnce(sseResponse(textRound("Could not read stock.")));
    vi.stubGlobal("fetch", fetchMock);

    const events = await collect(
      await streamCompletion({
        config,
        messages: [{ role: "user", content: "check stock" }],
        tools: [{ type: "function", function: { name: "check_stock", description: "d", parameters: {} } }],
        executeTool: async () => {
          throw new Error("database unreachable");
        },
      }),
    );

    expect(events.find((event) => event.type === "step")).toMatchObject({
      status: "failed",
      outputSummary: "database unreachable",
    });
    expect(events.some((event) => event.delta === "Could not read stock.")).toBe(true);
  });

  it("emits no progress events when the model answers without tools", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(sseResponse(textRound("Hello."))));

    const events = await collect(
      await streamCompletion({ config, messages: [{ role: "user", content: "hi" }] }),
    );

    expect(events.some((event) => event.type === "plan")).toBe(false);
    expect(events.some((event) => event.delta === "Hello.")).toBe(true);
  });

  it("runs the tools of one round concurrently", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          sseResponse([
            `data: ${JSON.stringify({
              choices: [
                {
                  delta: {
                    tool_calls: [
                      { index: 0, id: "a", function: { name: "t1", arguments: "{}" } },
                      { index: 1, id: "b", function: { name: "t2", arguments: "{}" } },
                    ],
                  },
                },
              ],
            })}\n\n`,
            "data: [DONE]\n\n",
          ]),
        )
        .mockResolvedValueOnce(sseResponse(textRound("done"))),
    );

    let running = 0;
    let peak = 0;
    await collect(
      await streamCompletion({
        config,
        messages: [{ role: "user", content: "go" }],
        tools: [{ type: "function", function: { name: "t1", description: "d", parameters: {} } }],
        executeTool: async () => {
          running += 1;
          peak = Math.max(peak, running);
          await new Promise((resolve) => setTimeout(resolve, 10));
          running -= 1;
          return "{}";
        },
      }),
    );

    expect(peak).toBe(2);
  });
});
