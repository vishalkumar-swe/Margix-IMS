import type { Sku } from "@prisma/client";
import { beforeEach, describe, expect, it } from "vitest";
import type { Actor } from "@/server/actor";
import { prisma } from "@/server/db/client";
import { postOpeningBalance } from "@/server/modules/opening/opening.service";
import { MockTallyClient, UnreachableTallyClient } from "@/server/modules/tally/tally-client";
import { retryTallyJob, runTallySync } from "@/server/modules/tally/tally-sync.service";
import { actorFor, createGodown, createSku, createUser } from "../../helpers/factories";

let admin: Actor;
let sku: Sku;

beforeEach(async () => {
  admin = actorFor(await createUser("ADMIN"));
  sku = await createSku({ code: "RM-001" });
  await prisma.sku.update({ where: { id: sku.id }, data: { tallyStockItemName: "Raw Material 001" } });
});

async function postOpeningIn(godown: { id: string }, quantity = "10") {
  return postOpeningBalance(admin, {
    godownId: godown.id,
    asOf: "2026-04-01",
    items: [{ skuId: sku.id, batchNumber: "B-1", quantity }],
  });
}

async function mappedGodown() {
  const godown = await createGodown();
  return prisma.godown.update({ where: { id: godown.id }, data: { tallyGodownName: "Main Location" } });
}

describe("Tally sync", () => {
  it("queues documents only for godowns with Tally sync enabled", async () => {
    await postOpeningIn(await mappedGodown());
    await postOpeningIn(await createGodown({ tallySyncEnabled: false }));
    expect(await prisma.tallySyncJob.count()).toBe(1);
  });

  it("marks jobs SYNCED and logs the attempt", async () => {
    const opening = await postOpeningIn(await mappedGodown());

    const summary = await runTallySync({ client: new MockTallyClient() });

    expect(summary).toEqual({ enabled: true, processed: 1, synced: 1, failed: 0 });
    const job = await prisma.tallySyncJob.findFirstOrThrow({ include: { logs: true } });
    expect(job.status).toBe("SYNCED");
    expect(job.tallyVoucherId).toBe(`MOCK-${opening.openingNumber}`);
    expect(job.logs).toHaveLength(1);
  });

  it("reports missing mappings in plain language", async () => {
    await prisma.sku.update({ where: { id: sku.id }, data: { tallyStockItemName: null } });
    await postOpeningIn(await mappedGodown());

    await runTallySync({ client: new MockTallyClient() });

    const job = await prisma.tallySyncJob.findFirstOrThrow();
    expect(job.status).toBe("FAILED");
    expect(job.lastError).toBe("Item RM-001 is not mapped in Tally.");
  });

  it("keeps the stock transaction when Tally is down, backs off, and retries on demand", async () => {
    await postOpeningIn(await mappedGodown());

    await runTallySync({ client: new UnreachableTallyClient() });
    const failed = await prisma.tallySyncJob.findFirstOrThrow();
    expect(failed.status).toBe("FAILED");
    expect(failed.nextAttemptAt.getTime()).toBeGreaterThan(Date.now());
    expect(await prisma.inventoryLedger.count()).toBe(1);

    // Backed-off jobs are not picked up again immediately…
    expect((await runTallySync({ client: new MockTallyClient() })).processed).toBe(0);

    // …but a manual retry makes them due at once.
    await retryTallyJob(admin, failed.id);
    expect((await runTallySync({ client: new MockTallyClient() })).synced).toBe(1);
  });

  it("does not let failing jobs block newer ones", async () => {
    await prisma.sku.update({ where: { id: sku.id }, data: { tallyStockItemName: null } });
    const godown = await mappedGodown();
    await postOpeningIn(godown);
    await runTallySync({ client: new MockTallyClient() });

    await prisma.sku.update({ where: { id: sku.id }, data: { tallyStockItemName: "Raw Material 001" } });
    await postOpeningIn(godown, "5");
    const summary = await runTallySync({ client: new MockTallyClient() });

    expect(summary.synced).toBe(1);
  });

  it("never pushes a job twice when runs overlap", async () => {
    const godown = await mappedGodown();
    for (let i = 0; i < 5; i++) await postOpeningIn(godown, String(i + 1));

    const runs = await Promise.all([
      runTallySync({ client: new MockTallyClient() }),
      runTallySync({ client: new MockTallyClient() }),
      runTallySync({ client: new MockTallyClient() }),
    ]);

    expect(runs.reduce((sum, r) => sum + r.processed, 0)).toBe(5);
    expect(await prisma.tallySyncLog.count()).toBe(5);
  });

  it("does nothing when the integration is disabled", async () => {
    await postOpeningIn(await mappedGodown());
    expect(await runTallySync({ client: null })).toMatchObject({ enabled: false, processed: 0 });
  });
});
