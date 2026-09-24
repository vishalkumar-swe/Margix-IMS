/**
 * Webhook event catalogue: every event another system can subscribe to.
 * Shared by the server (which emits them) and the admin screen (which lists
 * them). Add a new event here and map it where it happens — see
 * docs/integrations.md#webhooks.
 */

export interface WebhookEventDefinition {
  name: string;
  group: "Purchasing" | "Sales" | "Inventory" | "Masters" | "System";
  description: string;
}

export const WEBHOOK_EVENTS = [
  { name: "purchase_order.created", group: "Purchasing", description: "A purchase order was created (draft or open)." },
  { name: "purchase_order.submitted", group: "Purchasing", description: "A draft purchase order was submitted." },
  { name: "purchase_order.cancelled", group: "Purchasing", description: "A purchase order was cancelled." },
  { name: "purchase_order.short_closed", group: "Purchasing", description: "A partly received order was short-closed." },
  { name: "goods_receipt.posted", group: "Purchasing", description: "Goods were received against a purchase order (GRN)." },
  { name: "supplier_return.posted", group: "Purchasing", description: "Goods were returned to a supplier." },
  { name: "invoice.created", group: "Sales", description: "A customer invoice was created." },
  { name: "invoice.cancelled", group: "Sales", description: "An invoice was cancelled." },
  { name: "dispatch.posted", group: "Sales", description: "Goods were dispatched (delivery challan)." },
  { name: "customer_return.posted", group: "Sales", description: "A customer returned goods." },
  { name: "transfer.posted", group: "Inventory", description: "Stock moved between godowns." },
  { name: "adjustment.approved", group: "Inventory", description: "A stock adjustment was approved and posted." },
  { name: "opening_stock.posted", group: "Inventory", description: "Opening stock was posted (or corrected)." },
  { name: "ledger_entry.reversed", group: "Inventory", description: "A posted stock movement was reversed." },
  { name: "stock.low", group: "Inventory", description: "A product fell to or below its reorder level in a godown." },
  { name: "product.created", group: "Masters", description: "A product (SKU) was created." },
  { name: "product.updated", group: "Masters", description: "A product (SKU) was changed." },
  { name: "customer.created", group: "Masters", description: "A customer was created." },
  { name: "customer.updated", group: "Masters", description: "A customer was changed." },
  { name: "supplier.created", group: "Masters", description: "A supplier was created." },
  { name: "supplier.updated", group: "Masters", description: "A supplier was changed." },
  { name: "webhook.test", group: "System", description: "Sent by “Send test” on the Integrations screen." },
] as const satisfies readonly WebhookEventDefinition[];

export type WebhookEventName = (typeof WEBHOOK_EVENTS)[number]["name"];

/** Subscribing to "*" means every event, including ones added later. */
export const ALL_WEBHOOK_EVENTS = "*";

export const WEBHOOK_EVENT_NAMES = WEBHOOK_EVENTS.map((e) => e.name) as readonly string[];
