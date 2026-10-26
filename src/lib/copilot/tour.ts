import type { RoleCode } from "@prisma/client";
import type { WorkspaceCounts } from "./types";
import type { GuidedNavigationIntent, MilestoneAccess, TourMilestone, TourStep } from "./types";

const ADMIN: RoleCode = "ADMIN";
const STORE: RoleCode = "STORE_MANAGER";
const WAREHOUSE: RoleCode = "WAREHOUSE_OPERATOR";
const ACCOUNTS: RoleCode = "ACCOUNTS";
const MANAGEMENT: RoleCode = "MANAGEMENT";

const PATH_ESCAPE = /[.+^${}()|[\]\\]/g;
const escapeSegment = (segment: string) => segment.replace(PATH_ESCAPE, "\\$&");

/**
 * Six-milestone Product-to-Sale walkthrough (PRD §4). Selectors point at
 * `data-tour` anchors added to the real controls, so a refactor of IDs does
 * not silently break the tour.
 */
export const MILESTONES: TourMilestone[] = [
  {
    id: "sku-master",
    order: 1,
    title: "Add your first product",
    shortTitle: "Add product",
    description: "Create the SKU master record every purchase, invoice and ledger entry will reference.",
    icon: "package",
    fullRoles: [ADMIN],
    readRoles: [STORE, WAREHOUSE, ACCOUNTS, MANAGEMENT],
    celebration: "Your SKU is now the audit anchor for every stock movement of this product.",
    steps: [
      {
        id: "open-sku-form",
        title: "Start with the product",
        body: "Every journey starts with a product (SKU). Click New SKU to open the master form. The code becomes permanent once stock moves.",
        path: "/masters/skus",
        target: '[data-tour="new-sku"]',
        placement: "bottom",
        advanceOn: "click",
        permission: "master.manage",
        askPrompt: "What is an SKU and why does the code matter?",
      },
      {
        id: "sku-identity",
        title: "Code and name",
        body: "Use a short, permanent code (for example SKU-BASMATI-01) and a descriptive name such as Royal Basmati Rice 10kg. Names can change later; codes cannot.",
        path: "/masters/skus*",
        target: '[data-tour="sku-code"], #sku-code-input',
        askPrompt: "Can I edit the SKU code after saving?",
      },
      {
        id: "sku-unit",
        title: "Base unit and conversions",
        body: "Pick the atomic unit stock is tracked in (PCS or KG). If you buy or sell in bags or boxes, add an alternate unit afterwards with an exact conversion, e.g. 1 BAG = 25 KG.",
        path: "/masters/skus*",
        target: '[data-tour="sku-unit"], #base-unit-select',
        askPrompt: "What is the difference between a base unit and a sales unit?",
      },
      {
        id: "sku-tax",
        title: "HSN and GST slab",
        body: "Enter the HSN code and GST rate. Margix uses them to calculate CGST + SGST or IGST automatically on every invoice.",
        path: "/masters/skus*",
        target: '[data-tour="sku-hsn"], #hsn-input',
        askPrompt: "How do GST tax slabs apply to products?",
      },
      {
        id: "save-sku",
        title: "Save the product",
        body: "Save the SKU. Next you will bring physical stock in through a purchase order and a goods receipt note.",
        path: "/masters/skus*",
        target: '[data-tour="create-sku"], #create-sku-submit-btn',
        advanceOn: "event",
        eventName: "sku.created",
        permission: "master.manage",
      },
    ],
    readStep: {
      id: "sku-read-only",
      title: "Product master (read-only)",
      body: "Products are created by an administrator. Browse the list, scan a barcode, or open a product to see its stock, batches and ledger movements.",
      path: "/masters/skus",
      target: '[data-tour="sku-table"]',
      askPrompt: "Who can create or edit products?",
    },
  },
  {
    id: "procurement",
    order: 2,
    title: "Purchase and receive stock",
    shortTitle: "Procurement",
    description: "Raise a purchase order, then receive the goods into a godown with batch and expiry tracking.",
    icon: "truck",
    fullRoles: [ADMIN, STORE, WAREHOUSE],
    readRoles: [MANAGEMENT],
    celebration: "Only the accepted quantity entered the stock ledger. The PO now shows its receipt progress.",
    steps: [
      {
        id: "open-po",
        title: "Raise a purchase order",
        body: "Stock enters through documents. Create a purchase order for the supplier, or open an existing open PO if one is waiting to be received.",
        path: "/purchase-orders",
        target: '[data-tour="new-po"]',
        advanceOn: "click",
        roles: [ADMIN, STORE],
        permission: "po.manage",
        askPrompt: "How do I cancel or short-close a purchase order?",
      },
      {
        id: "po-supplier",
        title: "Choose the supplier",
        body: "Select who you are buying from. Their GST state decides whether the purchase carries CGST + SGST or IGST.",
        path: "/purchase-orders/new",
        target: '[data-tour="po-supplier"], #po-supplier',
        roles: [ADMIN, STORE],
        askPrompt: "How is GST decided on a purchase order?",
      },
      {
        id: "po-lines",
        title: "Add the product and quantity",
        body: "Add the SKU you just created, then enter the ordered quantity and rate. Quantities can be entered in an alternate unit such as BOX.",
        path: "/purchase-orders/new",
        target: '[data-tour="po-lines"], #po-lines',
        roles: [ADMIN, STORE],
        askPrompt: "Can I enter purchase order lines in alternate units?",
      },
      {
        id: "po-submit",
        title: "Open the purchase order",
        body: "Create and open the PO. It becomes an OPEN order that can be received against.",
        path: "/purchase-orders/new",
        target: '[data-tour="po-submit"], #po-submit',
        advanceOn: "route",
        completeOnPath: "/purchase-orders/[id]",
        roles: [ADMIN, STORE],
        permission: "po.manage",
      },
      {
        id: "grn-godown",
        title: "Receive the goods",
        body: "The PO page carries the receiving form. Choose the destination godown: this is where the accepted quantity will physically and financially live.",
        path: "/purchase-orders/[id], /grns/new",
        href: "/purchase-orders/{latestOpenPurchaseOrderId}",
        target: '[data-tour="grn-godown"], #grn-godown, #godown-source-select',
        askPrompt: "Can I receive goods without a purchase order?",
      },
      {
        id: "grn-batch",
        title: "Batch number and expiry",
        body: "Enter the manufacturer batch (for example BATCH-2026-A) and expiry date. FEFO dispatch later uses expiry to decide which batch ships first.",
        path: "/purchase-orders/[id], /grns/new",
        target: '[data-tour="grn-batch"], #grn-batch',
        askPrompt: "Why is batch expiry mandatory for food and pharma items?",
      },
      {
        id: "grn-accepted",
        title: "Accepted versus rejected",
        body: "Only the accepted quantity enters the ledger. Damaged goods can be rejected at the dock with a reason; the PO still records what arrived.",
        path: "/purchase-orders/[id], /grns/new",
        target: '[data-tour="grn-accepted"], #grn-accepted',
        askPrompt: "How do I record damaged or rejected quantities?",
      },
      {
        id: "grn-submit",
        title: "Post the goods receipt",
        body: "Post the GRN. Stock is added to the godown, a permanent INWARD ledger entry is written and the PO moves to received or partially received.",
        path: "/purchase-orders/[id], /grns/new",
        target: '[data-tour="grn-submit"], #grn-submit',
        advanceOn: "route",
        completeOnPath: "/purchase-orders/[id]",
        completeOnSearchParam: "posted",
        permission: "grn.create",
      },
    ],
    readStep: {
      id: "procurement-read-only",
      title: "Procurement (read-only)",
      body: "Purchase orders and goods receipts are raised by the store team. Open any order to see what was ordered, received and still pending.",
      path: "/purchase-orders",
      target: '[data-tour="po-table"]',
      askPrompt: "Where can I see what is still pending on a purchase order?",
    },
  },
  {
    id: "stock-audit",
    order: 3,
    title: "Verify stock and set a reorder level",
    shortTitle: "Stock audit",
    description: "Confirm on-hand stock, inspect the immutable ledger and protect against stockouts.",
    icon: "box",
    fullRoles: [ADMIN, STORE],
    readRoles: [WAREHOUSE, ACCOUNTS, MANAGEMENT],
    celebration: "Stock on hand always equals the sum of its ledger entries — that is the guarantee you just verified.",
    steps: [
      {
        id: "live-stock",
        title: "See live stock",
        body: "This is on-hand stock by SKU, godown and batch. The quantity is a projection of the ledger, not a number somebody typed.",
        path: "/stock",
        target: '[data-tour="stock-table"]',
        askPrompt: "Why can't I edit the stock balance directly on this screen?",
      },
      {
        id: "ledger",
        title: "Inspect the immutable ledger",
        body: "Your GRN created an INWARD entry with a positive sign and a post-transaction balance. Every stock change in Margix is an immutable ledger entry; mistakes are corrected by reversals, never edits.",
        path: "/ledger",
        href: "/ledger?movementType=INWARD",
        target: '[data-tour="ledger-table"]',
        askPrompt: "How do I reverse an accidental inward entry?",
      },
      {
        id: "reorder",
        title: "Set a reorder level",
        body: "Prevent stockouts by setting a minimum stock per SKU and godown. If available stock falls below it after a dispatch, a LOW_STOCK alert appears on the dashboard.",
        path: "/alerts",
        target: '[data-tour="reorder-rules"]',
        askPrompt: "When does the low-stock alert trigger?",
      },
    ],
    readStep: {
      id: "stock-read-only",
      title: "Stock and ledger (view only)",
      body: "You can view stock and ledger movements here. Adjustments and reorder rules need a store manager or administrator.",
      path: "/stock",
      target: '[data-tour="stock-table"]',
      askPrompt: "Why can't I edit stock quantities directly?",
    },
  },
  {
    id: "invoicing",
    order: 4,
    title: "Bill the customer",
    shortTitle: "Invoicing",
    description: "Create a GST-compliant sales invoice and understand why stock has not moved yet.",
    icon: "file",
    fullRoles: [ADMIN, STORE, ACCOUNTS],
    readRoles: [MANAGEMENT],
    celebration: "The invoice records the financial sale. Inventory is untouched until you post a dispatch.",
    steps: [
      {
        id: "open-invoice",
        title: "Create an invoice",
        body: "Invoicing records what was sold. Start a new invoice for a registered customer.",
        path: "/invoices",
        target: '[data-tour="new-invoice"]',
        advanceOn: "click",
        permission: "invoice.manage",
        askPrompt: "Did creating an invoice reduce my stock?",
      },
      {
        id: "invoice-customer",
        title: "Choose the customer",
        body: "Pick a registered buyer. If they have a GSTIN or state, Margix decides CGST + SGST versus IGST automatically.",
        path: "/invoices/new",
        target: '[data-tour="invoice-customer"], #customer-select-field',
        askPrompt: "How do I print a GST-compliant tax invoice?",
      },
      {
        id: "invoice-lines",
        title: "Add the SKU and quantity",
        body: "Select the product you stocked earlier and enter the quantity and selling rate. The unit can be the base unit or an alternate unit.",
        path: "/invoices/new",
        target: '[data-tour="invoice-lines"], #invoice-line-items',
        askPrompt: "Can I sell in a different unit from the one I bought in?",
      },
      {
        id: "invoice-tax",
        title: "Read the tax summary",
        body: "GST is computed from the customer's place of supply and the SKU's HSN slab. Check the CGST/SGST or IGST split before saving.",
        path: "/invoices/new",
        target: '[data-tour="invoice-tax"], #invoice-tax-summary',
        askPrompt: "How are CGST, SGST and IGST calculated?",
      },
      {
        id: "invoice-submit",
        title: "Post the invoice",
        body: "Save the invoice. It is now OPEN and awaiting dispatch; this is the financial sale, not the physical stock movement.",
        path: "/invoices/new",
        target: '[data-tour="invoice-submit"], #invoice-submit-btn',
        advanceOn: "route",
        completeOnPath: "/invoices/[id]",
        permission: "invoice.manage",
      },
    ],
    readStep: {
      id: "invoicing-read-only",
      title: "Invoices (read-only)",
      body: "Open any invoice to see the billed items, tax split, dispatch progress and Tally status. Billing needs the accounts role.",
      path: "/invoices",
      target: '[data-tour="invoice-table"]',
      askPrompt: "Why hasn't my stock decreased after saving an invoice?",
    },
  },
  {
    id: "dispatch",
    order: 5,
    title: "Pick batches and dispatch",
    shortTitle: "FEFO dispatch",
    description: "Fulfil the invoice from the right godown using First-Expired, First-Out batch picking.",
    icon: "truck",
    fullRoles: [ADMIN, STORE, WAREHOUSE],
    readRoles: [MANAGEMENT],
    celebration: "The ledger now carries an OUTWARD entry. What left the godown is exactly what the invoice said.",
    steps: [
      {
        id: "open-dispatchable-invoice",
        title: "Choose an invoice to fulfil",
        body: "A dispatch reduces physical stock. Start from an OPEN or PARTIALLY_DISPATCHED invoice so the quantities are linked to a sale.",
        path: "/invoices",
        href: "/invoices?status=OPEN",
        target: '[data-tour="invoice-table"]',
        advanceOn: "route",
        completeOnPath: "/invoices/[id]",
        askPrompt: "Can I do a partial dispatch?",
      },
      {
        id: "dispatch-from-invoice",
        title: "Open the dispatch form",
        body: "This invoice is still dispatchable. The button pre-links the customer and remaining quantities so you cannot dispatch more than was billed.",
        path: "/invoices/[id]",
        target: '[data-tour="dispatch-invoice-btn"]',
        advanceOn: "click",
        permission: "dispatch.create",
        askPrompt: "What happens if I try to dispatch more than what is in stock?",
      },
      {
        id: "dispatch-godown",
        title: "Pick the source godown",
        body: "Select the godown where the goods are physically staged. Batches are godown-specific, so this choice decides what can be picked.",
        path: "/dispatches/new",
        target: '[data-tour="dispatch-godown"], #godown-source-select',
      },
      {
        id: "dispatch-lines",
        title: "Add the SKU and quantity",
        body: "Choose the SKU and enter the quantity you are shipping. Leave the batch blank if you want Margix to pick it for you.",
        path: "/dispatches/new",
        target: '[data-tour="dispatch-lines"]',
        askPrompt: "How does FEFO automatic batch picking work?",
      },
      {
        id: "dispatch-fefo",
        title: "Use Pick batches (FEFO)",
        body: "Click Pick batches (FEFO). Margix scans available batches and allocates from the earliest expiry first, so older stock ships before it expires.",
        path: "/dispatches/new",
        target: '[data-tour="fefo-auto-pick-btn"], #fefo-auto-pick-btn',
        askPrompt: "What happens when the selected batch has less stock than I need?",
      },
      {
        id: "dispatch-submit",
        title: "Post the dispatch",
        body: "Post the dispatch. A delivery challan is generated, an OUTWARD ledger entry is written and the invoice moves to PARTIALLY_DISPATCHED or COMPLETE.",
        path: "/dispatches/new",
        target: '[data-tour="dispatch-submit"], #post-dispatch-submit-btn',
        advanceOn: "route",
        completeOnPath: "/dispatches/[id]",
        permission: "dispatch.create",
      },
    ],
    readStep: {
      id: "dispatch-read-only",
      title: "Dispatches (read-only)",
      body: "Dispatches are posted by the warehouse team. Open any dispatch to see the godown, batches and quantities that left stock.",
      path: "/dispatches",
      target: '[data-tour="dispatch-table"]',
      askPrompt: "How does FEFO automatic batch picking work?",
    },
  },
  {
    id: "reconciliation",
    order: 6,
    title: "Reconcile and finish",
    shortTitle: "Reconcile",
    description: "Confirm the invoice, accounting sync and movement report now tell one consistent story.",
    icon: "check",
    fullRoles: [ADMIN, ACCOUNTS],
    readRoles: [STORE, MANAGEMENT],
    celebration: "You have completed the full Product-to-Sale journey. The ledger, invoice and accounting queue agree.",
    steps: [
      {
        id: "completed-invoice",
        title: "Check the completed invoice",
        body: "The invoice now shows its dispatch progress and the delivery challan that fulfilled it. COMPLETE means every billed quantity has left stock.",
        path: "/invoices/[id]",
        href: "/invoices/{latestInvoiceId}",
        target: '[data-tour="invoice-status"]',
        askPrompt: "What does PARTIALLY_DISPATCHED mean?",
      },
      {
        id: "tally-queue",
        title: "Check the Tally sync queue",
        body: "The GRN and the dispatch were queued for Tally Prime automatically. A failure here never blocks or undoes a stock transaction; retry it from this page.",
        path: "/tally",
        target: '[data-tour="tally-queue"]',
        askPrompt: "What happens if Tally sync fails?",
      },
      {
        id: "movement-report",
        title: "Review the movement report",
        body: "The stock movement report ties the inward receipt and the outward dispatch together. This is the audit trail you can hand to accounts.",
        path: "/reports/movements",
        target: '[data-tour="movement-report"]',
        askPrompt: "Where can I download the stock movement report?",
      },
      {
        id: "finish",
        title: "Finish the walkthrough",
        body: "You have seen the complete journey: product, purchase, receipt, stock audit, invoice, FEFO dispatch and reconciliation.",
        path: "/reports/movements",
        advanceOn: "manual",
        target: '[data-tour="movement-report"]',
      },
    ],
    readStep: {
      id: "reconciliation-read-only",
      title: "Reconciliation (read-only)",
      body: "Tally sync and the final audit are owned by accounts. You can still open a completed invoice to see its delivery challan and status.",
      path: "/invoices/[id]",
      href: "/invoices/{latestInvoiceId}",
      target: '[data-tour="invoice-status"]',
      askPrompt: "How do I know an invoice was fully dispatched?",
    },
  },
];

/** Milestones in journey order (the array is the order, kept explicit for clarity). */
export const MILESTONE_BY_ID = new Map(MILESTONES.map((milestone) => [milestone.id, milestone]));

export function milestoneAccess(role: RoleCode, milestone: TourMilestone): MilestoneAccess {
  if (milestone.fullRoles.includes(role)) return "full";
  if (milestone.readRoles.includes(role)) return "read";
  return "hidden";
}

/** Steps a role can actually follow, including a one-step read-only version. */
export function stepsForRole(role: RoleCode, milestone: TourMilestone): TourStep[] {
  const access = milestoneAccess(role, milestone);
  if (access === "hidden") return [];
  if (access === "read") return [milestone.readStep];
  return milestone.steps.filter((step) => !step.roles || step.roles.includes(role));
}

export function visibleMilestones(role: RoleCode): TourMilestone[] {
  return MILESTONES.filter((milestone) => stepsForRole(role, milestone).length > 0);
}

/** True when the user may execute the write action attached to a step. */
export function stepIsReadOnly(role: RoleCode, milestone: TourMilestone, step: TourStep): boolean {
  if (milestoneAccess(role, milestone) !== "full") return true;
  return Boolean(step.roles && !step.roles.includes(role));
}

/** Path glob → matcher. Supports comma-separated patterns, `[id]` segment matchers and `*` wildcards. */
export function matchesPath(pattern: string, pathname: string): boolean {
  const patterns = pattern.split(",").map((p) => p.trim());
  return patterns.some((pat) => {
    const [pathPart] = pat.split("?");
    const expression = pathPart
      .split("/")
      .map((segment) => {
        if (/^\[.+\]$/.test(segment)) return "[^/]+";
        if (segment.includes("*")) return segment.split("*").map(escapeSegment).join(".*");
        return escapeSegment(segment);
      })
      .join("/");
    return new RegExp(`^${expression}/?$`).test(pathname);
  });
}

const PLACEHOLDER = /\{([a-zA-Z0-9_]+)\}/g;

/** Replaces {countsKey} placeholders; returns null when a required id is absent. */
export function resolveTemplate(template: string, counts: WorkspaceCounts): string | null {
  let unresolved = false;
  const resolved = template.replace(PLACEHOLDER, (_, key: string) => {
    const value = counts[key as keyof WorkspaceCounts];
    if (value === null || value === undefined) {
      unresolved = true;
      return "";
    }
    return String(value);
  });
  return unresolved ? null : resolved;
}

/** Builds a navigable href from an intent, or null when a prerequisite id is missing. */
export function intentHref(intent: GuidedNavigationIntent, counts: WorkspaceCounts): string | null {
  const route = resolveTemplate(intent.route, counts);
  if (!route) return null;
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(intent.params ?? {})) {
    const resolved = resolveTemplate(value, counts);
    if (resolved === null) return null;
    search.set(key, resolved);
  }
  const query = search.toString();
  if (!query) return route;
  return `${route}${route.includes("?") ? "&" : "?"}${query}`;
}

/** Static prefix of a URL template, used when a document id is still missing. */
export function fallbackHref(template: string): string {
  const [path] = template.split("?");
  const kept: string[] = [];
  for (const segment of path.split("/").filter(Boolean)) {
    if (segment.includes("{") || segment.includes("[")) break;
    kept.push(segment);
  }
  return `/${kept.join("/")}`;
}

/** Step href, falling back to the closest list screen when a document id is missing. */
export function stepHref(step: TourStep, counts: WorkspaceCounts): string | null {
  const template = step.href ?? step.path;
  return resolveTemplate(template, counts) ?? fallbackHref(template);
}

/**
 * Finds the step that matches the current location. Prefers the current or a
 * later step (natural progression when a document is opened), then earlier
 * ones (e.g. jumping back to verify stock).
 */
export function stepIndexForLocation(
  steps: TourStep[],
  pathname: string,
  fromIndex: number,
): number | null {
  const matches = steps
    .map((step, index) => (matchesPath(step.path, pathname) ? index : -1))
    .filter((index) => index >= 0);
  if (matches.length === 0) return null;
  const forward = matches.find((index) => index >= fromIndex);
  return forward ?? matches[matches.length - 1];
}

/** Completed count out of visible milestones for the launcher pill. */
export function progressForRole(role: RoleCode, completed: string[]): { done: number; total: number } {
  const milestones = visibleMilestones(role);
  return {
    done: milestones.filter((milestone) => completed.includes(milestone.id)).length,
    total: milestones.length,
  };
}

export function nextMilestone(role: RoleCode, currentId: string): TourMilestone | null {
  const milestones = visibleMilestones(role);
  const index = milestones.findIndex((milestone) => milestone.id === currentId);
  return index >= 0 ? (milestones[index + 1] ?? null) : (milestones[0] ?? null);
}
