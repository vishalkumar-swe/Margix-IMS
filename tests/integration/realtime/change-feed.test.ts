import { afterEach, describe, expect, it } from "vitest";
import { GET as eventsRoute } from "@/app/api/v1/events/route";
import { prisma } from "@/server/db/client";
import { withTx } from "@/server/db/transaction";
import { recordAudit } from "@/server/modules/audit/audit.service";
import { createCategory } from "@/server/modules/masters/masters.service";
import { changeFeed, type FeedMessage } from "@/server/realtime/change-feed";
import { sessionCookieFor } from "../../helpers/http";
import { stockedScenario } from "../../helpers/scenario";

const unsubscribers: (() => void)[] = [];
afterEach(() => unsubscribers.splice(0).forEach((stop) => stop()));

/** Subscribes and collects messages; waits until the LISTEN is in place. */
async function collect(): Promise<FeedMessage[]> {
  const received: FeedMessage[] = [];
  unsubscribers.push(changeFeed.subscribe((m) => received.push(m)));
  await changeFeed.ready();
  return received;
}

const settle = (ms = 400) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor<T>(check: () => T | undefined, timeoutMs = 3_000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = check();
    if (value !== undefined) return value;
    if (Date.now() > deadline) throw new Error("timed out waiting for change event");
    await settle(25);
  }
}

describe("live change feed", () => {
  it("announces a committed change with what changed, not the data", async () => {
    const s = await stockedScenario();
    const received = await collect();

    await createCategory(s.admin, { name: "Solvents" });

    const change = await waitFor(() => received.find((m) => m.type === "change" && m.action === "MASTER_CREATED"));
    expect(change).toEqual({ type: "change", entity: "Category", action: "MASTER_CREATED" });
  });

  it("says nothing about a rolled-back transaction or sign-in activity", async () => {
    const s = await stockedScenario();
    const received = await collect();

    await expect(
      withTx(async (tx) => {
        await recordAudit(tx, s.admin, { action: "MASTER_CREATED", entityType: "Category", entityId: null });
        throw new Error("abort");
      }),
    ).rejects.toThrow("abort");
    await withTx((tx) => recordAudit(tx, s.admin, { action: "AUTH_LOGIN_SUCCEEDED", entityType: "User", entityId: null }));

    await settle();
    expect(received).toEqual([]);
  });

  it("announces Tally job status changes made by the sync worker", async () => {
    await stockedScenario(); // the opening balance queues a Tally job
    const received = await collect();

    await prisma.tallySyncJob.updateMany({ data: { status: "SYNCED" } });

    await waitFor(() => received.find((m) => m.type === "change" && m.action === "TALLY_JOB_SYNCED"));
  });

  it("streams events to a signed-in browser and refuses anonymous ones", async () => {
    const s = await stockedScenario();

    const anonymous = await eventsRoute(new Request("http://localhost:3000/api/v1/events"), { params: Promise.resolve({}) });
    expect(anonymous.status).toBe(401);

    const abort = new AbortController();
    const response = await eventsRoute(
      new Request("http://localhost:3000/api/v1/events", {
        headers: { cookie: await sessionCookieFor(s.admin.userId), host: "localhost:3000" },
        signal: abort.signal,
      }),
      { params: Promise.resolve({}) },
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    expect(response.headers.get("cache-control")).toContain("no-transform");

    const reader = response.body!.pipeThrough(new TextDecoderStream()).getReader();
    let text = "";
    const readUntil = async (needle: string) => {
      while (!text.includes(needle)) {
        const { value, done } = await reader.read();
        if (done) throw new Error(`stream ended before "${needle}"`);
        text += value;
      }
    };

    await readUntil("event: ready");
    await changeFeed.ready();
    await createCategory(s.admin, { name: "Adhesives" });
    await readUntil("event: change");
    expect(text).toContain('"action":"MASTER_CREATED"');

    abort.abort();
    await settle(50);
    expect(changeFeed.subscriberCount).toBe(0);
  });
});
