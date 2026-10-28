/**
 * Screen anchoring: which business record the user is looking at.
 *
 * Relative commands ("delete it", "show its batches", "dispatch this") are the
 * normal way people talk about the row in front of them. Without an anchor the
 * Copilot has to ask "which supplier?" even though the answer is on screen.
 *
 * Two sources, in priority order:
 *  1. An explicit DOM opt-in (`data-copilot-entity` on a selected row or card),
 *     collected in the browser — see `collectScreenAnchor` in ./runtime.
 *  2. The route itself, which already identifies the record on every detail
 *     screen (`/purchase-orders/<id>`). This needs no page-level changes and so
 *     covers the common case on day one.
 */

/** Business record kinds the Copilot can anchor a pronoun to. */
export const SCREEN_ANCHOR_KINDS = [
  "supplier",
  "customer",
  "sku",
  "godown",
  "category",
  "purchaseOrder",
  "grn",
  "invoice",
  "dispatch",
  "transfer",
  "adjustment",
  "purchaseReturn",
  "salesReturn",
  "user",
] as const;

export type ScreenAnchorKind = (typeof SCREEN_ANCHOR_KINDS)[number];

export interface ScreenAnchor {
  kind: ScreenAnchorKind;
  /** Database id of the record, when the screen exposes one. */
  id?: string;
  /** Human label (name or document number) shown to the user. */
  label?: string;
  /** Where the anchor came from, so the agent can weigh how certain it is. */
  source: "route" | "selection";
}

/** Human-readable noun used when the agent talks about the anchored record. */
export const SCREEN_ANCHOR_NOUNS: Record<ScreenAnchorKind, string> = {
  supplier: "supplier",
  customer: "customer",
  sku: "product (SKU)",
  godown: "godown",
  category: "category",
  purchaseOrder: "purchase order",
  grn: "goods receipt (GRN)",
  invoice: "invoice",
  dispatch: "dispatch",
  transfer: "stock transfer",
  adjustment: "stock adjustment",
  purchaseReturn: "purchase return",
  salesReturn: "sales return",
  user: "user",
};

/**
 * Detail routes that carry a record id as their last segment. Ordered longest
 * prefix first so `/masters/skus` never matches the `/masters` family loosely.
 */
const DETAIL_ROUTES: ReadonlyArray<{ prefix: string; kind: ScreenAnchorKind }> = [
  { prefix: "/masters/suppliers", kind: "supplier" },
  { prefix: "/masters/customers", kind: "customer" },
  { prefix: "/masters/godowns", kind: "godown" },
  { prefix: "/masters/categories", kind: "category" },
  { prefix: "/masters/skus", kind: "sku" },
  { prefix: "/purchase-orders", kind: "purchaseOrder" },
  { prefix: "/purchase-returns", kind: "purchaseReturn" },
  { prefix: "/sales-returns", kind: "salesReturn" },
  { prefix: "/adjustments", kind: "adjustment" },
  { prefix: "/dispatches", kind: "dispatch" },
  { prefix: "/transfers", kind: "transfer" },
  { prefix: "/invoices", kind: "invoice" },
  { prefix: "/grns", kind: "grn" },
  { prefix: "/stock", kind: "sku" },
  { prefix: "/admin/users", kind: "user" },
];

/** Segments that are screens, not record ids. */
const NON_ID_SEGMENTS = new Set(["new", "edit", "print", "labels"]);

function stripQuery(route: string): string {
  const cut = route.search(/[?#]/);
  return (cut === -1 ? route : route.slice(0, cut)).replace(/\/+$/, "") || "/";
}

/**
 * Derives the anchored record from the URL alone. Returns null on list screens,
 * create forms and anything without an id — guessing there would be worse than
 * asking the user which record they mean.
 */
export function deriveAnchorFromRoute(route: string): ScreenAnchor | null {
  const path = stripQuery(route);
  for (const { prefix, kind } of DETAIL_ROUTES) {
    if (path !== prefix && !path.startsWith(`${prefix}/`)) continue;
    const segments = path.slice(prefix.length).split("/").filter(Boolean);
    const id = segments.find((segment) => !NON_ID_SEGMENTS.has(segment));
    if (!id) return null;
    return { kind, id, source: "route" };
  }
  return null;
}

/** Pronouns and bare demonstratives, in English and Hindi/Hinglish. */
const ANCHOR_REFERENCE = new RegExp(
  [
    "\\b(it|its|this|that|these|those|him|her|them)\\b",
    "\\b(ise|isko|iska|iski|inko|usko|uska|yeh|ye|wo|woh)\\b",
    "\\b(current|selected|open|this one)\\s+(record|row|entry|page|screen|one)\\b",
  ].join("|"),
  "i",
);

/** True when the message leans on the screen instead of naming the record. */
export function isAnchorReference(message: string): boolean {
  return ANCHOR_REFERENCE.test(message);
}

/** One prompt line describing the anchored record, or null when nothing is anchored. */
export function describeAnchor(anchor: ScreenAnchor | null | undefined): string | null {
  if (!anchor) return null;
  const noun = SCREEN_ANCHOR_NOUNS[anchor.kind];
  const parts = [`The user is currently viewing the ${noun}`];
  if (anchor.label) parts.push(`"${anchor.label}"`);
  if (anchor.id) parts.push(`(id: ${anchor.id})`);
  return `${parts.join(" ")}. Resolve "it", "this", "iska" and similar references to this record instead of asking which one they mean.`;
}

/**
 * Detail tool that loads the anchored record by id. Every one of these takes a
 * single `identifier` argument that accepts an id, so the anchor can be handed
 * straight through. `user` has no detail tool and stays unresolved.
 */
const ANCHOR_DETAIL_TOOL: Partial<Record<ScreenAnchorKind, string>> = {
  supplier: "get_supplier_detail",
  customer: "get_customer_detail",
  sku: "get_sku_detail",
  godown: "get_godown_detail",
  category: "get_category_detail",
  purchaseOrder: "get_purchase_order_detail",
  grn: "get_grn_detail",
  invoice: "get_invoice_detail",
  dispatch: "get_dispatch_detail",
  transfer: "get_transfer_detail",
  adjustment: "get_adjustment_detail",
  purchaseReturn: "get_purchase_return_detail",
  salesReturn: "get_sales_return_detail",
};

/** The lookup that turns an anchor into real record data, when one exists. */
export function anchorLookup(
  anchor: ScreenAnchor | null | undefined,
): { toolName: string; identifier: string; noun: string } | null {
  if (!anchor) return null;
  const toolName = ANCHOR_DETAIL_TOOL[anchor.kind];
  const identifier = anchor.id || anchor.label;
  if (!toolName || !identifier) return null;
  return { toolName, identifier, noun: SCREEN_ANCHOR_NOUNS[anchor.kind] };
}
