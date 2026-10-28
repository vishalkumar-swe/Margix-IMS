import { beforeEach, describe, expect, it } from "vitest";
import { POST as chatPost } from "@/app/api/v1/copilot/chat/route";
import { createUser } from "../../helpers/factories";
import { callStreamRoute, sessionCookieFor } from "../../helpers/http";

let cookie: string;

beforeEach(async () => {
  cookie = await sessionCookieFor((await createUser("ADMIN")).id);
});

async function ask(message: string, route = "/dashboard") {
  return callStreamRoute(chatPost, {
    path: "/api/v1/copilot/chat",
    cookie,
    body: { message, history: [], context: { route, role: "ADMIN" } },
  });
}

describe("copilot chat stream contract", () => {
  it("streams as server-sent events", async () => {
    const { status, headers } = await ask("list my godowns");
    expect(status).toBe(200);
    expect(headers.get("content-type")).toContain("text/event-stream");
  });

  it("answers a plain lookup with visible progress and a terminal event", async () => {
    const { frames } = await ask("list my godowns");

    // The browser only reads {delta} / {done} / plan / step — anything else is
    // invisible to the user, which is exactly the bug this guards.
    expect(frames.every((frame) => "delta" in frame || "done" in frame || "error" in frame || "type" in frame)).toBe(true);
    expect(frames.some((frame) => frame.type === "plan")).toBe(true);
    expect(frames.some((frame) => frame.type === "step")).toBe(true);
    expect(frames.filter((frame) => typeof frame.delta === "string").length).toBeGreaterThan(0);
    expect(frames.at(-1)).toMatchObject({ done: true });
  });

  it("reports each planned step as it completes", async () => {
    const { frames } = await ask("list my godowns");
    const plan = frames.find((frame) => frame.type === "plan") as { steps?: Array<Record<string, unknown>> };
    expect(plan.steps?.length).toBeGreaterThan(0);

    const steps = frames.filter((frame) => frame.type === "step");
    expect(steps.some((frame) => frame.status === "completed")).toBe(true);
  });

  it("delivers an off-domain refusal as readable text, not a silent stream", async () => {
    const { frames } = await ask("write me a python quicksort implementation");
    const text = frames
      .filter((frame) => typeof frame.delta === "string")
      .map((frame) => frame.delta as string)
      .join("");
    expect(text).toContain("Margix");
    expect(frames.at(-1)).toMatchObject({ done: true });
  });
});
