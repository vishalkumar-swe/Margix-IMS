import type { CopilotAction } from "./types";

export interface ErrorDiagnosis {
  title: string;
  explanation: string;
  actions: CopilotAction[];
}

function detail(details: unknown, key: string): string | null {
  if (!details || typeof details !== "object" || Array.isArray(details)) return null;
  const value = (details as Record<string, unknown>)[key];
  return value === null || value === undefined ? null : String(value);
}

/**
 * Plain-language explanations for blocked transactions (PRD §5.3). Every
 * action is a deep link into the screen that fixes the problem; no write is
 * performed automatically.
 */
export function diagnoseError(code: string, message: string, details: unknown): ErrorDiagnosis {
  switch (code) {
    case "INSUFFICIENT_STOCK": {
      const sku = detail(details, "sku");
      const batch = detail(details, "batch");
      const available = detail(details, "available");
      const requested = detail(details, "requested");
      return {
        title: "Dispatch blocked: not enough stock in that batch",
        explanation:
          available && requested
            ? `The selected batch${batch ? ` (${batch})` : ""}${sku ? ` for ${sku}` : ""} has ${available} available, but you asked for ${requested}. Margix never allows a negative stock balance.`
            : "The selected batch does not have enough stock for this quantity. Margix never allows a negative stock balance.",
        actions: [
          {
            label: "Auto-allocate from the next expiring batch",
            description: "Let Margix pick across batches in FEFO order.",
            route: "/dispatches/new",
            highlightSelector: '[data-tour="fefo-auto-pick-btn"]',
            tooltipText: "Enter the same quantity, then click Pick batches (FEFO).",
            permission: "dispatch.create",
          },
          {
            label: "Check stock in other godowns",
            description: "See whether another godown can fulfil the quantity.",
            route: "/stock",
            highlightSelector: '[data-tour="stock-table"]',
            permission: "stock.view",
          },
        ],
      };
    }
    case "OVER_RECEIPT":
      return {
        title: "Goods receipt blocked: more than the pending quantity",
        explanation:
          "The accepted quantity exceeds what is still pending on the purchase order. Amend the order or reject the surplus at the dock.",
        actions: [
          {
            label: "Open the purchase order",
            description: "Check ordered, received and pending quantities.",
            route: "/purchase-orders/{latestOpenPurchaseOrderId}",
            highlightSelector: '[data-tour="grn-accepted"]',
            permission: "grn.view",
          },
          {
            label: "Review all open purchase orders",
            route: "/purchase-orders?status=OPEN",
            permission: "po.view",
          },
        ],
      };
    case "OVER_DISPATCH":
      return {
        title: "Dispatch blocked: more than the invoice remaining",
        explanation:
          "You are trying to dispatch more than is still undelivered on this invoice. Reduce the quantity, or do a partial dispatch now and the rest later.",
        actions: [
          {
            label: "Check invoice remaining quantities",
            route: "/invoices/{latestOpenInvoiceId}",
            highlightSelector: '[data-tour="invoice-status"]',
            permission: "invoice.view",
          },
          {
            label: "Review dispatches",
            route: "/dispatches",
            permission: "dispatch.view",
          },
        ],
      };
    case "OVER_RETURN":
      return {
        title: "Return blocked: more than the returnable quantity",
        explanation: "The return quantity exceeds what was supplied or dispatched and not already returned.",
        actions: [
          {
            label: "Open customer returns",
            route: "/sales-returns",
            permission: "return.view",
          },
          {
            label: "Open supplier returns",
            route: "/purchase-returns",
            permission: "return.view",
          },
        ],
      };
    case "BATCH_MISMATCH":
      return {
        title: "That batch does not belong to this stock line",
        explanation: "The selected batch is not held for this SKU in the chosen godown. Pick a batch from the list, or let FEFO allocate one.",
        actions: [
          {
            label: "Pick batches with FEFO",
            route: "/dispatches/new",
            highlightSelector: '[data-tour="fefo-auto-pick-btn"]',
            permission: "dispatch.create",
          },
          {
            label: "View stock by batch",
            route: "/stock",
            permission: "stock.view",
          },
        ],
      };
    case "INVALID_STATE":
      return {
        title: "That action is not allowed in the document's current state",
        explanation:
          "A document can only move forward through its lifecycle (for example, only an OPEN invoice with nothing dispatched can be cancelled). Refresh to see the latest status.",
        actions: [
          {
            label: "Open invoices",
            route: "/invoices",
            permission: "invoice.view",
          },
          {
            label: "Open purchase orders",
            route: "/purchase-orders",
            permission: "po.view",
          },
        ],
      };
    case "FORBIDDEN":
    case "MAKER_CHECKER_VIOLATION":
      return {
        title: code === "MAKER_CHECKER_VIOLATION" ? "A second person must approve this" : "Your role cannot perform this action",
        explanation:
          code === "MAKER_CHECKER_VIOLATION"
            ? "Maker–checker control means the person who requested an adjustment cannot also approve it. Ask a store manager or administrator to review it."
            : "Margix enforces permissions on the server as well as in the interface. Ask an administrator if you need this access.",
        actions: [
          {
            label: "See pending approvals",
            route: "/adjustments?status=SUBMITTED",
            permission: "adjustment.view",
          },
          {
            label: "Open the daily checklist",
            route: "/dashboard",
            permission: "dashboard.view",
          },
        ],
      };
    case "VALIDATION_ERROR":
      return {
        title: "Some fields need attention",
        explanation: message || "Check the highlighted fields and try again.",
        actions: [],
      };
    case "DUPLICATE":
      return {
        title: "This record already exists",
        explanation: "A document or master record with the same key already exists. Open the existing one instead of creating a duplicate.",
        actions: [
          {
            label: "Open the list",
            route: "/dashboard",
            permission: "dashboard.view",
          },
        ],
      };
    case "NOT_FOUND":
      return {
        title: "That record no longer exists",
        explanation: "It may have been cancelled, archived or belongs to another godown. Go back to the list and pick it again.",
        actions: [
          {
            label: "Back to the dashboard",
            route: "/dashboard",
            permission: "dashboard.view",
          },
        ],
      };
    case "ALREADY_REVERSED":
    case "CANNOT_REVERSE":
      return {
        title: "This ledger entry cannot be reversed",
        explanation:
          code === "ALREADY_REVERSED"
            ? "A reversal for this entry already exists. Every ledger entry can be reversed at most once."
            : "The entry is referenced by a document that must be handled first (for example, the source document is not in a reversible state).",
        actions: [
          {
            label: "Open the ledger",
            route: "/ledger",
            permission: "ledger.view",
          },
        ],
      };
    case "UNAUTHENTICATED":
      return {
        title: "Your session expired",
        explanation: "Sign in again; your unsaved form input may be lost.",
        actions: [],
      };
    case "NETWORK_ERROR":
      return {
        title: "Cannot reach the server",
        explanation: "Check the connection. The walkthrough steps continue to work offline; the AI answer may be unavailable until you reconnect.",
        actions: [],
      };
    default:
      return {
        title: "That action was blocked",
        explanation: message || "The server rejected the request. Try again, or ask the Copilot for an explanation.",
        actions: [
          {
            label: "Ask the Copilot",
            route: "/dashboard",
            permission: "dashboard.view",
          },
        ],
      };
  }
}
