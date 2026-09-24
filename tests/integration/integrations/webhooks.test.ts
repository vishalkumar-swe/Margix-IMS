import type { RoleCode } from "@prisma/client";
import { beforeEach, describe, expect, it } from "vitest";
import { POST as webhooksPost } from "@/app/api/v1/integrations/webhooks/route";
import { GET as integrationsGet } from "@/app/api/v1/integrations/route";
import { prisma } from "@/server/db/client";
import { withTx } from "@/server/db/transaction";
import { deliverDueWebhooks } from "@/server/integrations/webhooks/webhook-delivery";
import { emitWebhookEvent } from "@/server/integrations/webhooks/webhook-emitter";
import { verifyWebhookSignature } from "@/server/integrations/webhooks/webhook-signature";
import {
  createWebhookEndpoint,
  retryWebhookDelivery,
  sendWebhookTest,
  updateWebhookEndpoint,
} from "@/server/integrations/webhooks/webhooks.service";
import { postDispatch } from "@/server/modules/dispatch/dispatch.service";
import { callRoute, sessionCookieFor } from "../../helpers/http";
import { createUser } from "../../helpers/factories";
import { errorCode, stockedScenario, type StockedScenario } from "../../helpers/scenario";

/** A public (TEST-NET) address, so no DNS lookup is needed and the private-address guard passes. */
const URL = "https://203.0.113.10/hooks/margix";

let s: StockedScenario;

interface Captured {
  url: string;
  headers: Headers;
  body: string;
}

function receiver(status = 200) {
  const calls: Captured[] = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    calls.push({ url, headers: new Headers(init.headers), body: String(init.body) });
    return new Response("ok", { status });
  }) as unknown as typeof fetch;
  return { calls, fetchImpl };
}

const dispatch = () =>
  postDispatch(s.operator, { godownId: s.godown.id, items: [{ skuId: s.sku.id, batchId: s.batch.id, quantity: "5" }] });

beforeEach(async () => {
  s = await stockedScenario("100");
});

describe("webhook events (transactional outbox)", () => {
  it("queues subscribed events with the business change and delivers them signed", async () => {
    const endpoint = await createWebhookEndpoint(s.admin, { name: "ERP", url: URL, events: ["dispatch.posted"], isActive: true });
    expect(endpoint.secret).toMatch(/^whsec_/);

    await dispatch();
    const [queued] = await prisma.webhookDelivery.findMany();
    expect(queued).toMatchObject({ event: "dispatch.posted", status: "PENDING", endpointId: endpoint.id });

    const { calls, fetchImpl } = receiver();
    expect(await deliverDueWebhooks({ fetchImpl })).toEqual({ processed: 1, delivered: 1, failed: 0 });
    const [call] = calls;
    expect(call.url).toBe(URL);
    expect(call.headers.get("x-margix-event")).toBe("dispatch.posted");
    expect(call.headers.get("x-margix-delivery")).toBe(queued.id);
    expect(verifyWebhookSignature(endpoint.secret, call.body, call.headers.get("x-margix-signature")!)).toBe(true);
    expect(JSON.parse(call.body)).toMatchObject({ event: "dispatch.posted", data: { entityType: expect.any(String) } });
    expect(await prisma.webhookDelivery.findUniqueOrThrow({ where: { id: queued.id } })).toMatchObject({
      status: "DELIVERED",
      responseStatus: 200,
    });
  });

  it("queues nothing for unsubscribed events, paused endpoints or rolled-back transactions", async () => {
    const endpoint = await createWebhookEndpoint(s.admin, { name: "ERP", url: URL, events: ["goods_receipt.posted"], isActive: true });
    await dispatch();
    expect(await prisma.webhookDelivery.count()).toBe(0);

    await updateWebhookEndpoint(s.admin, endpoint.id, { events: ["*"], isActive: false });
    await dispatch();
    expect(await prisma.webhookDelivery.count()).toBe(0);

    await updateWebhookEndpoint(s.admin, endpoint.id, { isActive: true });
    await withTx(async (tx) => {
      await emitWebhookEvent(tx, "stock.low", { skuId: s.sku.id });
      throw new Error("rollback");
    }).catch(() => {});
    expect(await prisma.webhookDelivery.count()).toBe(0);
  });

  it("retries transient failures with backoff and stops at permanent ones", async () => {
    const endpoint = await createWebhookEndpoint(s.admin, { name: "ERP", url: URL, events: ["*"], isActive: true });
    await sendWebhookTest(s.admin, endpoint.id);

    expect(await deliverDueWebhooks({ fetchImpl: receiver(503).fetchImpl })).toMatchObject({ failed: 1 });
    const retrying = await prisma.webhookDelivery.findFirstOrThrow();
    expect(retrying).toMatchObject({ status: "FAILED", attempts: 1, responseStatus: 503 });
    expect(retrying.nextAttemptAt.getTime()).toBeGreaterThan(Date.now() + 60_000);
    // Not due yet: nothing is claimed.
    expect(await deliverDueWebhooks({ fetchImpl: receiver().fetchImpl })).toMatchObject({ processed: 0 });

    await prisma.webhookDelivery.update({ where: { id: retrying.id }, data: { nextAttemptAt: new Date() } });
    expect(await deliverDueWebhooks({ fetchImpl: receiver(410).fetchImpl })).toMatchObject({ failed: 1 });
    const gaveUp = await prisma.webhookDelivery.findUniqueOrThrow({ where: { id: retrying.id } });
    expect(gaveUp).toMatchObject({ status: "FAILED", attempts: 6, responseStatus: 410 });

    // A manual retry re-queues it with a fresh budget.
    await retryWebhookDelivery(s.admin, gaveUp.id);
    expect(await deliverDueWebhooks({ fetchImpl: receiver().fetchImpl })).toMatchObject({ delivered: 1 });
    expect(await errorCode(retryWebhookDelivery(s.admin, gaveUp.id))).toBe("INVALID_STATE");
  });

  it("refuses private and plain-http URLs", async () => {
    for (const url of ["http://203.0.113.10/x", "https://127.0.0.1/x", "https://10.0.0.5/x", "https://localhost/x"]) {
      expect(await errorCode(createWebhookEndpoint(s.admin, { name: "Bad", url, events: ["*"], isActive: true }))).toBe(
        "VALIDATION_ERROR",
      );
    }
  });
});

describe("integrations API", () => {
  it("is for administrators only and never returns secrets in lists", async () => {
    const cookies = {} as Record<RoleCode, string>;
    for (const role of ["ADMIN", "STORE_MANAGER"] as RoleCode[]) cookies[role] = await sessionCookieFor((await createUser(role)).id);

    expect((await callRoute(integrationsGet, { cookie: cookies.STORE_MANAGER })).status).toBe(403);
    const list = await callRoute<{ key: string; settings: { env: string; isSet: boolean }[] }[]>(integrationsGet, {
      cookie: cookies.ADMIN,
    });
    expect(list.status).toBe(200);
    expect(list.json.data!.map((i) => i.key)).toEqual(["tally", "email", "whatsapp", "in-app", "webhooks"]);
    expect(JSON.stringify(list.json.data)).not.toMatch(/"value"/);

    const created = await callRoute<{ secret: string }>(webhooksPost, {
      cookie: cookies.ADMIN,
      body: { name: "ERP", url: URL, events: ["stock.low", "stock.low"] },
    });
    expect(created.status).toBeLessThan(300);
    expect(created.json.data!.secret).toMatch(/^whsec_/);
    const stored = await prisma.webhookEndpoint.findFirstOrThrow();
    expect(stored.events).toEqual(["stock.low"]);
  });
});
