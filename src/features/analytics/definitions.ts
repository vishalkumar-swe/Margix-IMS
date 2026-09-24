/**
 * How each figure is defined — shown as "i" hints next to the numbers and
 * mirrored in docs/architecture.md. Keep in step with analytics.queries.ts.
 */
export const DEFINITIONS = {
  sales:
    "Invoice lines × rate (per entered unit), before GST, by invoice date. Cancelled invoices are excluded.",
  gst: "Sales value × each line's GST rate ÷ 100.",
  invoices: "Invoices (not cancelled) dated in the period.",
  averageInvoice: "Sales value ÷ number of invoices.",
  purchases: "Ordered quantity × rate on submitted purchase orders (not draft or cancelled), by order date.",
  received: "Accepted GRN quantity × the PO rate, by receipt date. Reversed receipts are excluded.",
  pendingPurchases: "Quantity still to be received on open and partially received purchase orders × rate, whatever the order date.",
  inventoryValue:
    "On-hand quantity × latest purchase cost per base unit (most recent submitted PO line with a rate). Compared with the stock value at the start of the period, rebuilt from the ledger at today's costs. Stock with no purchase rate is counted as “no cost” and not valued.",
  stockQuantity: "Total on-hand quantity in base units across all godowns (mixed units when several products are included).",
  lowStock: "Products with an active low-stock alert (below the reorder level in at least one godown).",
  outOfStock: "Active products with no stock in any godown.",
  fastMoving: "Products with the highest dispatched quantity in the period (reversed dispatches excluded), valued at latest cost.",
  movement:
    "Inward = opening, receipts and customer returns; outward = dispatches and supplier returns; valued at latest cost. Transfers between godowns are excluded.",
  ageing: "On-hand stock per product × godown by days since its last movement, valued at latest cost.",
  rejection: "Rejected ÷ received quantity on GRNs in the period.",
  awaitingDispatch: "Open and partially dispatched invoices; value = undispatched quantity × rate.",
} as const;

export function slowHint(minDays: number, maxDays: number | null): string {
  return maxDays === null
    ? `On-hand stock with no movement for ${minDays} days or more.`
    : `On-hand stock with no movement for ${minDays}–${maxDays - 1} days (dead stock is listed separately).`;
}
