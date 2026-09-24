import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { ALL_WEBHOOK_EVENTS, type WebhookEventName } from "@/lib/webhook-events";
import type { Tx } from "@/server/db/transaction";

/**
 * Emits webhook events inside the business transaction (transactional
 * outbox): one delivery row per subscribed endpoint, committed — or rolled
 * back — together with the change itself. The worker delivers them later.
 */

/** The audited business actions that are also webhook events. */
const AUDIT_EVENTS: Record<string, WebhookEventName | Record<string, WebhookEventName>> = {
  PO_CREATED: "purchase_order.created",
  PO_SUBMITTED: "purchase_order.submitted",
  PO_CANCELLED: "purchase_order.cancelled",
  PO_SHORT_CLOSED: "purchase_order.short_closed",
  GRN_POSTED: "goods_receipt.posted",
  PURCHASE_RETURN_POSTED: "supplier_return.posted",
  INVOICE_CREATED: "invoice.created",
  INVOICE_CANCELLED: "invoice.cancelled",
  DISPATCH_POSTED: "dispatch.posted",
  SALES_RETURN_POSTED: "customer_return.posted",
  TRANSFER_POSTED: "transfer.posted",
  ADJUSTMENT_APPROVED: "adjustment.approved",
  OPENING_BALANCE_POSTED: "opening_stock.posted",
  LEDGER_ENTRY_REVERSED: "ledger_entry.reversed",
  MASTER_CREATED: { Sku: "product.created", Customer: "customer.created", Supplier: "supplier.created" },
  MASTER_UPDATED: { Sku: "product.updated", Customer: "customer.updated", Supplier: "supplier.updated" },
};

/** The webhook event for an audit record, if it is one. */
export function webhookEventForAudit(action: string, entityType: string): WebhookEventName | null {
  const mapped = AUDIT_EVENTS[action];
  if (!mapped) return null;
  return typeof mapped === "string" ? mapped : (mapped[entityType] ?? null);
}

export interface WebhookEventBody {
  /** Same for every endpoint receiving this occurrence — receivers use it to ignore duplicates. */
  id: string;
  event: string;
  occurredAt: string;
  data: Prisma.InputJsonValue | null;
}

/**
 * Queues `event` for every active endpoint subscribed to it. Cheap when no
 * endpoint is configured (one indexed query). Returns the number queued.
 */
export async function emitWebhookEvent(
  tx: Tx,
  event: WebhookEventName,
  data: Prisma.InputJsonValue | null,
  /** Only these endpoints, whatever they subscribe to (used by "Send test"). */
  options: { endpointIds?: string[] } = {},
): Promise<number> {
  const endpoints = await tx.webhookEndpoint.findMany({
    where: options.endpointIds
      ? { isActive: true, id: { in: options.endpointIds } }
      : { isActive: true, events: { hasSome: [event, ALL_WEBHOOK_EVENTS] } },
    select: { id: true },
  });
  if (endpoints.length === 0) return 0;

  const eventId = randomUUID();
  const body: WebhookEventBody = { id: eventId, event, occurredAt: new Date().toISOString(), data };
  await tx.webhookDelivery.createMany({
    data: endpoints.map((endpoint) => ({ endpointId: endpoint.id, eventId, event, payload: body as unknown as Prisma.InputJsonValue })),
  });
  return endpoints.length;
}
