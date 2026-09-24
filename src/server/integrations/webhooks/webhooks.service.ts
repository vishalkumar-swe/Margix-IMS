import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import type { WebhookDelivery, WebhookEndpoint } from "@prisma/client";
import type { WebhookEndpointInput } from "@/lib/validation/webhooks";
import type { Actor } from "@/server/actor";
import { getEnv } from "@/server/config/env";
import { prisma } from "@/server/db/client";
import { withTx } from "@/server/db/transaction";
import { ConflictError, NotFoundError, ValidationError } from "@/server/errors";
import { recordAudit } from "@/server/modules/audit/audit.service";
import { emitWebhookEvent } from "./webhook-emitter";
import { newWebhookSecret } from "./webhook-signature";

/**
 * Webhook endpoints (Administration → Integrations). The signing secret is
 * returned only when an endpoint is created or its secret rotated; lists
 * never include it.
 */

export type PublicWebhookEndpoint = Omit<WebhookEndpoint, "secret">;

const publicSelect = {
  id: true,
  name: true,
  url: true,
  events: true,
  isActive: true,
  createdById: true,
  createdAt: true,
  updatedAt: true,
} as const;

export function listWebhookEndpoints(): Promise<PublicWebhookEndpoint[]> {
  return prisma.webhookEndpoint.findMany({ select: publicSelect, orderBy: { createdAt: "asc" } });
}

export function listWebhookDeliveries(options: { endpointId?: string; limit?: number } = {}) {
  return prisma.webhookDelivery.findMany({
    where: options.endpointId ? { endpointId: options.endpointId } : undefined,
    orderBy: { createdAt: "desc" },
    take: options.limit ?? 50,
    select: {
      id: true,
      endpointId: true,
      event: true,
      status: true,
      attempts: true,
      responseStatus: true,
      lastError: true,
      nextAttemptAt: true,
      deliveredAt: true,
      createdAt: true,
      endpoint: { select: { name: true } },
    },
  });
}

export async function createWebhookEndpoint(
  actor: Actor,
  input: WebhookEndpointInput,
): Promise<PublicWebhookEndpoint & { secret: string }> {
  await assertDeliverableUrl(input.url);
  return withTx(async (tx) => {
    const endpoint = await tx.webhookEndpoint.create({
      data: { ...input, secret: newWebhookSecret(), createdById: actor.userId },
    });
    await recordAudit(tx, actor, {
      action: "WEBHOOK_CREATED",
      entityType: "WebhookEndpoint",
      entityId: endpoint.id,
      newData: withoutSecret(endpoint),
    });
    return endpoint;
  });
}

export async function updateWebhookEndpoint(
  actor: Actor,
  id: string,
  input: Partial<WebhookEndpointInput>,
): Promise<PublicWebhookEndpoint> {
  if (input.url) await assertDeliverableUrl(input.url);
  return withTx(async (tx) => {
    const before = await tx.webhookEndpoint.findUnique({ where: { id }, select: publicSelect });
    if (!before) throw new NotFoundError("Webhook", id);
    const after = await tx.webhookEndpoint.update({ where: { id }, data: input, select: publicSelect });
    await recordAudit(tx, actor, { action: "WEBHOOK_UPDATED", entityType: "WebhookEndpoint", entityId: id, oldData: before, newData: after });
    return after;
  });
}

export function deleteWebhookEndpoint(actor: Actor, id: string): Promise<{ id: string }> {
  return withTx(async (tx) => {
    const before = await tx.webhookEndpoint.findUnique({ where: { id }, select: publicSelect });
    if (!before) throw new NotFoundError("Webhook", id);
    // Its delivery history goes with it (ON DELETE CASCADE); the audit log keeps the record.
    await tx.webhookEndpoint.delete({ where: { id } });
    await recordAudit(tx, actor, { action: "WEBHOOK_DELETED", entityType: "WebhookEndpoint", entityId: id, oldData: before });
    return { id };
  });
}

export function rotateWebhookSecret(actor: Actor, id: string): Promise<{ id: string; secret: string }> {
  return withTx(async (tx) => {
    const secret = newWebhookSecret();
    const { count } = await tx.webhookEndpoint.updateMany({ where: { id }, data: { secret } });
    if (count === 0) throw new NotFoundError("Webhook", id);
    await recordAudit(tx, actor, { action: "WEBHOOK_SECRET_ROTATED", entityType: "WebhookEndpoint", entityId: id });
    return { id, secret };
  });
}

/** Queues a `webhook.test` event for one endpoint; the worker delivers it within seconds. */
export function sendWebhookTest(actor: Actor, id: string): Promise<{ queued: number }> {
  return withTx(async (tx) => {
    const endpoint = await tx.webhookEndpoint.findUnique({ where: { id }, select: { id: true, isActive: true } });
    if (!endpoint) throw new NotFoundError("Webhook", id);
    if (!endpoint.isActive) throw new ConflictError("INVALID_STATE", "Turn the webhook on before sending a test.");
    const queued = await emitWebhookEvent(tx, "webhook.test", { message: "Test event from Margix IMS." }, { endpointIds: [id] });
    await recordAudit(tx, actor, { action: "WEBHOOK_TEST_SENT", entityType: "WebhookEndpoint", entityId: id });
    return { queued };
  });
}

/** Re-queues a FAILED delivery immediately with a fresh attempt budget. */
export function retryWebhookDelivery(actor: Actor, id: string): Promise<WebhookDelivery> {
  return withTx(async (tx) => {
    const { count } = await tx.webhookDelivery.updateMany({
      where: { id, status: "FAILED" },
      data: { status: "PENDING", attempts: 0, nextAttemptAt: new Date(), lockedUntil: null },
    });
    if (count === 0) {
      const row = await tx.webhookDelivery.findUnique({ where: { id }, select: { status: true } });
      if (!row) throw new NotFoundError("Webhook delivery", id);
      throw new ConflictError("INVALID_STATE", `Only failed deliveries can be retried (this one is ${row.status}).`);
    }
    await recordAudit(tx, actor, { action: "WEBHOOK_DELIVERY_RETRIED", entityType: "WebhookDelivery", entityId: id });
    return tx.webhookDelivery.findUniqueOrThrow({ where: { id } });
  });
}

function withoutSecret(endpoint: WebhookEndpoint): PublicWebhookEndpoint {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { secret, ...rest } = endpoint;
  return rest;
}

/**
 * Refuses URLs the server should not call (SSRF guard): plain http and
 * loopback / private / link-local addresses, unless WEBHOOK_ALLOW_PRIVATE_URLS
 * is set for an on-premise receiver.
 */
export async function assertDeliverableUrl(url: string, allowPrivate = getEnv().WEBHOOK_ALLOW_PRIVATE_URLS): Promise<void> {
  if (allowPrivate) return;
  const invalid = (message: string) => new ValidationError("The request is invalid.", [{ path: "url", message }]);
  const parsed = new URL(url);
  if (parsed.protocol !== "https:") throw invalid("Use an https:// URL.");
  const host = parsed.hostname.replace(/^\[|\]$/g, "");
  let addresses: string[];
  try {
    addresses = isIP(host) ? [host] : (await lookup(host, { all: true })).map((a) => a.address);
  } catch {
    throw invalid(`The host ${host} could not be found.`);
  }
  if (host === "localhost" || addresses.some(isPrivateAddress)) {
    throw invalid("This URL points to a private or local address. Use a public URL.");
  }
}

export function isPrivateAddress(address: string): boolean {
  const ip = address.toLowerCase().replace(/^::ffff:/, "");
  if (isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
  }
  return ip === "::1" || ip === "::" || ip.startsWith("fc") || ip.startsWith("fd") || ip.startsWith("fe80");
}
