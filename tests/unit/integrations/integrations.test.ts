import { describe, expect, it } from "vitest";
import { IntegrationHttpError, integrationFetch } from "@/server/integrations/http";
import { nextAttemptAt, retryDelayMinutes, shouldGiveUp } from "@/server/integrations/retry";
import { webhookEventForAudit } from "@/server/integrations/webhooks/webhook-emitter";
import { signWebhookBody, verifyWebhookSignature } from "@/server/integrations/webhooks/webhook-signature";
import { isPrivateAddress } from "@/server/integrations/webhooks/webhooks.service";

const respond = (status: number, body: string | null = null) => (async () => new Response(body, { status })) as unknown as typeof fetch;

describe("retry policy", () => {
  it("doubles from 2 minutes, caps at an hour and gives up after the attempt budget", () => {
    expect([1, 2, 3, 4, 5, 6, 7].map((a) => retryDelayMinutes(a))).toEqual([2, 4, 8, 16, 32, 60, 60]);
    expect(nextAttemptAt(1, new Date("2026-01-01T00:00:00Z")).toISOString()).toBe("2026-01-01T00:02:00.000Z");
    expect(shouldGiveUp(5)).toBe(false);
    expect(shouldGiveUp(6)).toBe(true);
  });
});

describe("integrationFetch", () => {
  const options = (fetchImpl: typeof fetch) => ({ service: "Test API", timeoutMs: 1000, fetchImpl });

  it("returns 2xx responses", async () => {
    const response = await integrationFetch("https://x.test", {}, options(respond(204)));
    expect(response.status).toBe(204);
  });

  it.each([
    [500, true],
    [503, true],
    [429, true],
    [408, true],
    [400, false],
    [401, false],
    [404, false],
  ])("HTTP %i is retryable: %s", async (status, retryable) => {
    const error = await integrationFetch("https://x.test", {}, options(respond(status, "nope"))).catch((e) => e);
    expect(error).toBeInstanceOf(IntegrationHttpError);
    expect(error).toMatchObject({ retryable, status, body: "nope" });
  });

  it("treats network errors as retryable", async () => {
    const failing = (async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;
    const error = await integrationFetch("https://x.test", {}, options(failing)).catch((e) => e);
    expect(error).toMatchObject({ retryable: true, message: expect.stringContaining("could not be reached") });
  });
});

describe("webhook signatures", () => {
  const body = JSON.stringify({ event: "webhook.test" });

  it("round-trips and rejects tampering, wrong secrets and stale timestamps", () => {
    const now = 1_800_000_000;
    const header = signWebhookBody("whsec_a", body, now);
    expect(header).toMatch(/^t=1800000000,v1=[0-9a-f]{64}$/);
    expect(verifyWebhookSignature("whsec_a", body, header, 300, now + 10)).toBe(true);
    expect(verifyWebhookSignature("whsec_a", `${body} `, header, 300, now)).toBe(false);
    expect(verifyWebhookSignature("whsec_b", body, header, 300, now)).toBe(false);
    expect(verifyWebhookSignature("whsec_a", body, header, 300, now + 301)).toBe(false);
    expect(verifyWebhookSignature("whsec_a", body, "garbage", 300, now)).toBe(false);
  });
});

describe("webhook events", () => {
  it("maps audited actions to events, per entity type for masters", () => {
    expect(webhookEventForAudit("GRN_POSTED", "Grn")).toBe("goods_receipt.posted");
    expect(webhookEventForAudit("MASTER_CREATED", "Sku")).toBe("product.created");
    expect(webhookEventForAudit("MASTER_UPDATED", "Supplier")).toBe("supplier.updated");
    expect(webhookEventForAudit("MASTER_CREATED", "Godown")).toBeNull();
    expect(webhookEventForAudit("AUTH_LOGIN_SUCCEEDED", "User")).toBeNull();
  });
});

describe("webhook URL guard", () => {
  it.each(["127.0.0.1", "10.1.2.3", "172.20.0.1", "192.168.1.5", "169.254.169.254", "100.100.1.1", "::1", "fd00::1", "::ffff:10.0.0.1"])(
    "%s is private",
    (ip) => expect(isPrivateAddress(ip)).toBe(true),
  );
  it.each(["8.8.8.8", "203.0.113.10", "172.32.0.1", "2606:4700::1111"])("%s is public", (ip) => expect(isPrivateAddress(ip)).toBe(false));
});
