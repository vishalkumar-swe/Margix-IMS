import { randomUUID } from "node:crypto";
import type { RoleCode } from "@prisma/client";
import type { Actor } from "@/server/actor";
import { prisma } from "@/server/db/client";
import { toDecimal } from "@/server/db/decimal";
import { can } from "@/lib/permissions";
import type {
  CopilotAction,
  CopilotConfirmation,
  CopilotActionType,
} from "@/lib/copilot/types";
import { executeCopilotToolData } from "./tools";
import { getWorkspaceCounts } from "./copilot.queries";
import { answerFromKnowledge } from "./knowledge";
import { cancelInvoice } from "@/server/modules/invoices/invoice.service";
import {
  cancelPurchaseOrder,
  shortClosePurchaseOrder,
} from "@/server/modules/purchasing/purchase-order.service";
import { reverseEntry } from "@/server/modules/reversals/reversals.service";
import {
  purgeSandboxData,
  seedSandboxData,
} from "@/server/modules/copilot/sandbox.service";
import { postDispatch } from "@/server/modules/dispatch/dispatch.service";

export interface AgentContext {
  role: RoleCode;
  route: string;
}

export interface AgentPlanStep {
  name: string;
  toolName: string;
  arguments: Record<string, unknown>;
  description: string;
}

export interface AgentExecutionResult {
  stepsExecuted: Array<{
    toolName: string;
    description: string;
    output: unknown;
  }>;
  markdownAnswer: string;
  actions: CopilotAction[];
  sources: string[];
  confirmation?: CopilotConfirmation;
}

interface FefoResult {
  error?: string;
  product: { code: string; name: string; unit: string };
  godown?: string | null;
  warehouseAvailableQty?: string;
  requestedQty: string;
  allocatedQty: string;
  shortfallQty: string;
  status: string;
  pickList: Array<{
    batch: string;
    expiryDate: string | null;
    godown: string;
    availableQty: string;
    pickQty: string;
    remainingInBatch: string;
  }>;
  recommendation: string;
}

interface DispatchReadinessResult {
  error?: string;
  invoiceId: string;
  invoiceNumber: string;
  customer: string;
  invoiceStatus: string;
  overallReadiness: string;
  recommendedGodown?: string | null;
  lines: Array<{
    product: string;
    billed: string;
    dispatched: string;
    remaining: string;
    availableUnexpiredStock: string;
    unit?: string;
    status: string;
  }>;
  recommendedAction: string;
}

interface ExpiringBatchesResult {
  count: number;
  timeframeDays: number;
  batches: Array<{
    product: string;
    godown: string;
    batch: string;
    expiryDate: string | null;
    quantity: string;
    unit: string;
    daysLeft: number;
    status: string;
  }>;
}

interface LedgerResult {
  count: number;
  movements: Array<{
    entryNo: string;
    movementType: string;
    quantity: string;
    balanceAfter: string;
    product: string;
    godown: string;
    batch: string;
    reference: string;
    remarks: string | null;
    timestamp: string;
  }>;
}

interface DocumentStatusResult {
  error?: string;
  type: string;
  id?: string;
  number: string;
  status: string;
  party: string;
  date?: string;
  lines?: Array<{
    product: string;
    ordered?: string;
    received?: string;
    pending?: string;
    billed?: string;
    dispatched?: string;
    remaining?: string;
    unit?: string;
    batch?: string;
    quantity?: string;
    baseUnit?: string;
    expiryDate?: string | null;
  }>;
  receipts?: Array<{ number: string; godown: string; status: string }>;
}

interface StockAlertsResult {
  count: number;
  alerts: Array<{
    product: string;
    baseUnit: string;
    godown: string;
    currentQuantity: string;
    reorderLevel: string;
    updatedAt: string;
  }>;
}

interface ReorderResult {
  count: number;
  recommendations: Array<{
    product: string;
    godown: string;
    currentStock: string;
    reorderLevel: string;
    recommendedMinimumOrder: string;
    unit: string;
  }>;
}

interface GodownResult {
  count: number;
  godowns: Array<{
    id: string;
    code: string;
    name: string;
    address: string | null;
    tallySyncEnabled: boolean;
    activeStockLines: number;
  }>;
}

interface StockResult {
  error?: string;
  product: { code: string; name: string; baseUnit: string };
  godown: string | { code: string; name: string };
  totalQuantity: string;
  batches: Array<{
    godown: string;
    batch: string;
    expiryDate: string | null;
    expired: boolean;
    quantity: string;
  }>;
}

const encoder = new TextEncoder();
const sseEvent = (payload: unknown) => encoder.encode(`data: ${JSON.stringify(payload)}\n\n`);

/**
 * Intelligent Multi-Step Autonomous Inventory Agent.
 * Runs conversational, multi-leg operations and analytical tool calls directly
 * against PostgreSQL. Features human-in-the-loop confirmation for destructive
 * actions, state transitions, and automated FEFO dispatching.
 */
export class AutonomousAgentService {
  /**
   * Checks whether the user's message is an operational action or a confirmation reply.
   */
  static isOperationalOrConfirmation(
    message: string,
    history?: Array<{ role: "user" | "assistant"; content: string; confirmation?: CopilotConfirmation }>,
  ): boolean {
    const plan = AutonomousAgentService.planIntent(message, undefined, history);
    return (
      plan.intent.startsWith("propose_") ||
      plan.intent.startsWith("execute_") ||
      plan.intent === "execute_pending_confirmation" ||
      plan.intent === "cancel_pending_confirmation"
    );
  }

  /**
   * Formulates the multi-step plan, parsing conversational phrasing, broken English,
   * Hindi/Hinglish terms, and pending confirmation replies.
   */
  static planIntent(
    message: string,
    context?: AgentContext,
    history?: Array<{ role: "user" | "assistant"; content: string; confirmation?: CopilotConfirmation }>,
  ): { intent: string; steps: AgentPlanStep[]; pendingConfirmation?: CopilotConfirmation } {
    const text = message.toLowerCase().trim();
    const onInvoiceRoute = Boolean(context?.route?.startsWith("/invoices"));
    const tidyTerm = (value: string) =>
      value
        .replace(/[?!.,;:]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();

    // 0. Check for conversational reply to a pending confirmation card
    const lastAssistantMsg = history
      ?.slice()
      .reverse()
      .find((m) => m.role === "assistant" && m.confirmation && m.confirmation.status === "pending");

    if (lastAssistantMsg?.confirmation) {
      const isNegative = /\b(no|cancel|cancle|cencel|cancl|nahi|abort|ruk jao|mat karo|stop|nevermind|reject|chhod do|rehne do|chodo|dont do|don't do|na)\b/i.test(
        text,
      );
      const isAffirmative = /\b(yes|confirm|proceed|ha|haan|sure|kardo|kar do|kar dena|karo|do it|ok|okay|yep|go ahead|approve|approved|theek hai|sahi hai|chalega|proceed karo)\b/i.test(
        text,
      );

      if (isNegative) {
        return {
          intent: "cancel_pending_confirmation",
          steps: [],
          pendingConfirmation: lastAssistantMsg.confirmation,
        };
      }
      if (isAffirmative) {
        return {
          intent: "execute_pending_confirmation",
          steps: [],
          pendingConfirmation: lastAssistantMsg.confirmation,
        };
      }
    }

    // 1. Destructive: Cancel Invoice
    if (
      /\b(cancel|cancle|cencel|cancl|hatao|radd|void|delete)\b.*(inv|invoice|bill)/i.test(text) ||
      /\b(inv|invoice|bill)\b.*(cancel|cancle|cencel|cancl|hatao|radd|void|delete)/i.test(text)
    ) {
      return { intent: "propose_cancel_invoice", steps: [] };
    }

    // 2. Destructive: Cancel Purchase Order
    if (
      /\b(cancel|cancle|cencel|cancl|hatao|radd|void|delete)\b.*(po|purchase order|order)/i.test(text) ||
      /\b(po|purchase order)\b.*(cancel|cancle|cencel|cancl|hatao|radd|void|delete)/i.test(text)
    ) {
      return { intent: "propose_cancel_po", steps: [] };
    }

    // 3. Destructive: Short-Close Purchase Order
    if (/\b(short close|short-close|shortclose|close po|po close|baki close|close remaining|adhe me close)\b/i.test(text)) {
      return { intent: "propose_short_close_po", steps: [] };
    }

    // 4. Destructive / Financial: Reverse Ledger Entry
    if (
      /\b(reverse|revurse|revers|undo|ulta karo|wapas lo)\b.*(ledger|entry|movement|le-|\bstock\b|wrong|galat)/i.test(text) ||
      /\b(ledger|entry|movement|wrong entry|galat entry)\b.*(reverse|revurse|revers|undo|ulta|wapas)/i.test(text)
    ) {
      return { intent: "propose_reverse_ledger", steps: [] };
    }

    // 5. Destructive / Environment: Purge Sandbox
    if (
      /\b(purge|clean|clear|reset|delete)\b.*(sandbox|demo|test data|sample)/i.test(text) ||
      /\b(demo|sandbox)\b.*(hata|saaf|delete|purge|reset|clean)/i.test(text)
    ) {
      return { intent: "propose_purge_sandbox", steps: [] };
    }

    // 6. Environment: Seed Sandbox Data
    if (
      /\b(seed|load|setup|create|populate)\b.*(sandbox|demo|test data)/i.test(text) ||
      /\b(demo|sandbox)\b.*(bana|chalu|seed|load|setup)/i.test(text)
    ) {
      return { intent: "execute_seed_sandbox", steps: [] };
    }

    // 7. Multi-leg: Fulfill / Dispatch Outward with automated FEFO
    const isDispatchReadinessQuery =
      text.includes("can we dispatch") ||
      text.includes("ready to dispatch") ||
      text.includes("dispatch readiness") ||
      text.includes("is it ready");

    if (
      !isDispatchReadinessQuery &&
      (/\b(dispatch|despatch|disptach|fulfill|deliver|bhejo|nikalo|rawana|challan)\b.*(inv|invoice|bill|order|fefo)/i.test(text) ||
      (/\b(dispatch|fulfill|challan)\b/i.test(text) && onInvoiceRoute))
    ) {
      return { intent: "propose_post_dispatch", steps: [] };
    }

    // 8. Masters Creation: Customer
    if (/\b(create|add|new|naya)\b.*(customer|client|buyer)/i.test(text)) {
      return { intent: "execute_create_customer", steps: [] };
    }

    // 9. Masters Creation: Supplier
    if (/\b(create|add|new|naya)\b.*(supplier|vendor)/i.test(text)) {
      return { intent: "execute_create_supplier", steps: [] };
    }

    // 10. Masters Creation: Godown
    if (/\b(create|add|new|naya)\b.*(godown|warehouse|depot)/i.test(text)) {
      return { intent: "execute_create_godown", steps: [] };
    }

    // 11. FEFO Pick List / Batch Allocation
    if (
      text.includes("pick list") ||
      text.includes("pick batch") ||
      text.includes("allocate batch") ||
      text.includes("batch allocation") ||
      (text.includes("fefo") && (text.includes("pick") || text.includes("allocat") || text.includes("batch")))
    ) {
      const quantityWithUnit = message.match(
        /\b(\d+(?:\.\d+)?)\s*(?:bags?|kg|units?|boxes?|pcs?|nos?)\b/i,
      );
      const quantityAfterKeyword = message.match(
        /\b(?:for|qty|quantity|need|pick|allocate)\s+(\d+(?:\.\d+)?)\b/i,
      );
      const quantityMatch = quantityWithUnit ?? quantityAfterKeyword;
      const quantity = quantityMatch ? parseFloat(quantityMatch[1]) : 10;
      const withoutQuantity = quantityMatch ? message.replace(quantityMatch[0], " ") : message;
      const cleanProduct =
        tidyTerm(
          withoutQuantity.replace(
            /\b(?:fefo|pick\s*list|pick\s*batch|allocate\s*batch|batch\s*allocation|for|of|can\s*we|please|give\s*me|generate|the|my|a|an)\b/gi,
            " ",
          ),
        ) || "Basmati";

      return {
        intent: "fefo_allocation",
        steps: [
          {
            name: "Resolve Product",
            toolName: "search_products",
            arguments: { query: cleanProduct, limit: 3 },
            description: `Searching product catalog for "${cleanProduct}"`,
          },
          {
            name: "Calculate FEFO Pick Allocation",
            toolName: "get_fefo_pick_list",
            arguments: { product: cleanProduct, quantity },
            description: `Computing FEFO batch allocation for ${quantity} units of "${cleanProduct}"`,
          },
        ],
      };
    }

    // 12. Dispatch Readiness Check (Invoice or Product)
    const invMatch = message.match(/((?:DEMO-)?INV-[A-Za-z0-9-]+)/i);
    const wantsDispatch =
      text.includes("dispatch readiness") ||
      text.includes("ready to dispatch") ||
      text.includes("can we dispatch") ||
      text.includes("fulfill invoice") ||
      (text.includes("dispatch") && onInvoiceRoute);

    if (invMatch && wantsDispatch) {
      const invoiceNumber = invMatch[1].toUpperCase();
      return {
        intent: "dispatch_readiness",
        steps: [
          {
            name: "Check Invoice Readiness",
            toolName: "check_dispatch_readiness",
            arguments: { invoiceNumber },
            description: `Verifying line-item stock availability for invoice "${invoiceNumber}"`,
          },
          {
            name: "Inspect Document Status",
            toolName: "get_document_status",
            arguments: { type: "invoice", number: invoiceNumber },
            description: `Querying billed vs dispatched progress for "${invoiceNumber}"`,
          },
        ],
      };
    }

    if (!invMatch && wantsDispatch) {
      return {
        intent: "dispatch_readiness",
        steps: [],
      };
    }

    if (invMatch) {
      const invoiceNumber = invMatch[1].toUpperCase();
      return {
        intent: "document_status",
        steps: [
          {
            name: "Fetch Invoice Status",
            toolName: "get_document_status",
            arguments: { type: "invoice", number: invoiceNumber },
            description: `Querying billed vs dispatched progress for "${invoiceNumber}"`,
          },
        ],
      };
    }

    // 13. Expiring Batches / Shelf-life Risk Analysis
    if (
      text.includes("expir") ||
      text.includes("shelf life") ||
      text.includes("near expiry") ||
      text.includes("expired")
    ) {
      const daysMatch = message.match(/(\d+)\s*(?:days?|months?)/i);
      let days = 60;
      if (daysMatch) {
        const val = parseInt(daysMatch[1], 10);
        days = text.includes("month") ? val * 30 : val;
      }
      return {
        intent: "expiring_batches",
        steps: [
          {
            name: "Scan Expiring Batches",
            toolName: "check_expiring_batches",
            arguments: { days, limit: 10 },
            description: `Scanning all godowns for batches expiring within ${days} days`,
          },
        ],
      };
    }

    // 14. Immutable Inventory Ledger Audit Movements
    if (
      (text.includes("ledger") ||
        text.includes("audit") ||
        text.includes("movement") ||
        text.includes("signed entry") ||
        text.includes("transactions") ||
        text.includes("le-")) &&
      /(show|list|view|get|recent|entries|entry|movements?|audit trail|history|for)\b/.test(text)
    ) {
      const docMatch = message.match(/((?:DEMO-)?(?:PO|INV|DC|GRN)-[A-Za-z0-9-]+)/i);
      const referenceNo = docMatch ? docMatch[1].toUpperCase() : undefined;
      const cleanProduct = !referenceNo
        ? tidyTerm(
            message.replace(
              /\b(?:ledger|audit|movements?|signed|entries?|transactions?|history|show|view|get|for|of|me|recent|latest|all|the|my|please)\b/gi,
              " ",
            ),
          )
        : undefined;

      return {
        intent: "ledger_audit",
        steps: [
          {
            name: "Retrieve Ledger Audit Trail",
            toolName: "get_recent_ledger_movements",
            arguments: {
              product: cleanProduct && cleanProduct.length > 2 ? cleanProduct : undefined,
              referenceNo,
              limit: 8,
            },
            description: `Querying cryptographic inventory ledger records ${referenceNo ? `for reference ${referenceNo}` : ""}`,
          },
        ],
      };
    }

    // 15. Document Status Tracking (PO, Invoice, Dispatch, GRN)
    const poMatch = message.match(/((?:DEMO-)?PO-[A-Za-z0-9-]+)/i);
    const dcMatch = message.match(/((?:DEMO-)?DC-[A-Za-z0-9-]+)/i);
    if (poMatch) {
      const number = poMatch[1].toUpperCase();
      return {
        intent: "document_status",
        steps: [
          {
            name: "Fetch Purchase Order Status",
            toolName: "get_document_status",
            arguments: { type: "purchase_order", number },
            description: `Checking ordered vs received lines for ${number}`,
          },
        ],
      };
    }
    if (text.includes("purchase order") || text.includes(" po ")) {
      return { intent: "document_status", steps: [] };
    }
    if (dcMatch) {
      const number = dcMatch[1].toUpperCase();
      return {
        intent: "document_status",
        steps: [
          {
            name: "Fetch Dispatch Status",
            toolName: "get_document_status",
            arguments: { type: "dispatch", number },
            description: `Inspecting dispatch outward details for ${number}`,
          },
        ],
      };
    }
    if (text.includes("dispatch document") || text.includes("outward")) {
      return { intent: "document_status", steps: [] };
    }

    // 16. Low Stock Alerts & Reorder Replenishment
    if (
      text.includes("low stock") ||
      text.includes("reorder") ||
      text.includes("shortage") ||
      text.includes("replenish") ||
      text.includes("alert")
    ) {
      return {
        intent: "low_stock_reorder",
        steps: [
          {
            name: "Inspect Active Low Stock Alerts",
            toolName: "get_low_stock_alerts",
            arguments: { limit: 6 },
            description: "Checking active SKU stock alerts below safety thresholds",
          },
          {
            name: "Calculate Reorder Recommendations",
            toolName: "get_reorder_recommendations",
            arguments: { limit: 6 },
            description: "Determining replenishment quantities and supplier reorders",
          },
        ],
      };
    }

    // 17. Godown Capacities and Locations
    if (text.includes("godown") || text.includes("warehouse") || text.includes("depot")) {
      return {
        intent: "godowns",
        steps: [
          {
            name: "Query Godowns Registry",
            toolName: "get_godowns",
            arguments: {},
            description: "Fetching list of registered warehouse godowns and storage locations",
          },
        ],
      };
    }

    // 18. Stock Balance & Batch Check for a Product
    const isConceptualStock =
      /\b(how does|how do|what is|why is|explain|tell me about)\b/i.test(text) &&
      !/\b(balance|available|on hand|in warehouse|batch|godown|how much|how many)\b/i.test(text);

    if (
      !isConceptualStock &&
      (text.includes("stock") ||
        text.includes("inventory") ||
        text.includes("on hand") ||
        text.includes("available") ||
        text.includes("how many") ||
        text.includes("balance"))
    ) {
      const clean =
        tidyTerm(
          message.replace(
            /\b(?:stock|inventory|on\s*hand|available|how\s*many|balance|check|find|what\s*is\s*the|of|for|in|me|show|please|my|the)\b/gi,
            "",
          ),
        ) || "Basmati";

      return {
        intent: "stock_check",
        steps: [
          {
            name: "Search Product",
            toolName: "search_products",
            arguments: { query: clean, limit: 3 },
            description: `Looking up SKU details for "${clean}"`,
          },
          {
            name: "Check Stock Balances & FEFO Batches",
            toolName: "check_stock",
            arguments: { product: clean },
            description: `Querying live godown stock and batches for "${clean}"`,
          },
        ],
      };
    }

    // Default: Operational Knowledge & Workspace Summary
    return {
      intent: "general_operational",
      steps: [
        {
          name: "Workspace Summary",
          toolName: "get_workspace_summary",
          arguments: {},
          description: "Fetching live workspace totals and operational metrics",
        },
      ],
    };
  }

  /**
   * Executes confirmed decisions directly against the database with actor audit logs.
   */
  static async executeConfirmation(
    actor: Actor,
    params: {
      confirmationId: string;
      actionType: CopilotActionType;
      payload: Record<string, unknown>;
      decision: "confirm" | "cancel" | "alternative";
      alternativeAction?: string;
      reason?: string;
    },
  ): Promise<{
    success: boolean;
    data: {
      status: "executed" | "cancelled" | "failed";
      message: string;
      actions?: CopilotAction[];
      details?: unknown;
    };
  }> {
    if (params.decision === "cancel") {
      return {
        success: true,
        data: {
          status: "cancelled",
          message: "Operation was cancelled. No database records were modified.",
          actions: [],
        },
      };
    }

    try {
      switch (params.actionType) {
        case "CANCEL_INVOICE": {
          if (!can(actor.role, "invoice.manage")) {
            return {
              success: false,
              data: {
                status: "failed",
                message: `Permission denied: Your role (${actor.role}) cannot cancel invoices.`,
              },
            };
          }
          const invoiceId = params.payload.invoiceId as string;
          const invoiceNumber = (params.payload.invoiceNumber as string) || "Invoice";
          const reason = params.reason || (params.payload.reason as string) || "Cancelled via Copilot confirmation";
          await cancelInvoice(actor, invoiceId, reason);
          return {
            success: true,
            data: {
              status: "executed",
              message: `Invoice ${invoiceNumber} has been marked as CANCELLED.`,
              actions: [{ label: "View Invoices", route: "/invoices", permission: "invoice.view" }],
            },
          };
        }

        case "CANCEL_PO": {
          if (!can(actor.role, "po.manage")) {
            return {
              success: false,
              data: {
                status: "failed",
                message: `Permission denied: Your role (${actor.role}) cannot cancel purchase orders.`,
              },
            };
          }
          const poId = params.payload.poId as string;
          const poNumber = (params.payload.poNumber as string) || "PO";
          const reason = params.reason || (params.payload.reason as string) || "Cancelled via Copilot confirmation";
          await cancelPurchaseOrder(actor, poId, reason);
          return {
            success: true,
            data: {
              status: "executed",
              message: `Purchase order ${poNumber} has been marked as CANCELLED.`,
              actions: [{ label: "View Purchase Orders", route: "/purchase-orders", permission: "po.view" }],
            },
          };
        }

        case "SHORT_CLOSE_PO": {
          if (!can(actor.role, "po.manage")) {
            return {
              success: false,
              data: {
                status: "failed",
                message: `Permission denied: Your role (${actor.role}) cannot short-close purchase orders.`,
              },
            };
          }
          const poId = params.payload.poId as string;
          const poNumber = (params.payload.poNumber as string) || "PO";
          const reason = params.reason || (params.payload.reason as string) || "Short-closed via Copilot confirmation";
          await shortClosePurchaseOrder(actor, poId, reason);
          return {
            success: true,
            data: {
              status: "executed",
              message: `Purchase order ${poNumber} has been short-closed. Remaining lines are closed.`,
              actions: [{ label: "View Purchase Orders", route: "/purchase-orders", permission: "po.view" }],
            },
          };
        }

        case "REVERSE_LEDGER": {
          if (!can(actor.role, "ledger.reverse")) {
            return {
              success: false,
              data: {
                status: "failed",
                message: `Permission denied: Your role (${actor.role}) cannot reverse ledger movements.`,
              },
            };
          }
          const entryId = params.payload.entryId as string;
          const entryNo = (params.payload.entryNo as string) || "Ledger entry";
          const reason = params.reason || (params.payload.reason as string) || "Reversed via Copilot confirmation";
          await reverseEntry(actor, entryId, reason);
          return {
            success: true,
            data: {
              status: "executed",
              message: `Ledger movement ${entryNo} has been reversed. Counter-entry appended to immutable ledger.`,
              actions: [{ label: "View Stock Ledger", route: "/ledger", permission: "ledger.view" }],
            },
          };
        }

        case "PURGE_SANDBOX": {
          if (!can(actor.role, "settings.manage")) {
            return {
              success: false,
              data: {
                status: "failed",
                message: `Permission denied: Your role (${actor.role}) cannot manage sandbox test data.`,
              },
            };
          }
          const purgeResult = await purgeSandboxData(actor);
          return {
            success: true,
            data: {
              status: "executed",
              message: `Sandbox demo environment purged cleanly (${purgeResult.purgedCount} demo records removed). Zero production records affected.`,
              actions: [{ label: "View Live Stock", route: "/stock", permission: "stock.view" }],
            },
          };
        }

        case "SEED_SANDBOX": {
          if (!can(actor.role, "settings.manage")) {
            return {
              success: false,
              data: {
                status: "failed",
                message: `Permission denied: Your role (${actor.role}) cannot seed sandbox test data.`,
              },
            };
          }
          const seedResult = await seedSandboxData(actor);
          return {
            success: true,
            data: {
              status: "executed",
              message: seedResult.message,
              actions: [
                { label: "View Live Stock", route: "/stock", permission: "stock.view" },
                { label: "View Invoices", route: "/invoices", permission: "invoice.view" },
              ],
            },
          };
        }

        case "POST_DISPATCH": {
          if (!can(actor.role, "dispatch.create")) {
            return {
              success: false,
              data: {
                status: "failed",
                message: `Permission denied: Your role (${actor.role}) cannot create dispatches.`,
              },
            };
          }
          const outward = await postDispatch(actor, params.payload as unknown as Parameters<typeof postDispatch>[1]);
          return {
            success: true,
            data: {
              status: "executed",
              message: `Delivery Challan ${outward.outwardNumber} posted successfully. Stock deducted from ledger via FEFO.`,
              actions: [
                { label: "Open Delivery Challan", route: `/dispatches/${outward.id}`, permission: "dispatch.view" },
                { label: "View Invoices", route: "/invoices", permission: "invoice.view" },
              ],
            },
          };
        }

        default:
          return {
            success: false,
            data: {
              status: "failed",
              message: `Unsupported action type "${params.actionType}".`,
            },
          };
      }
    } catch (error) {
      return {
        success: false,
        data: {
          status: "failed",
          message: error instanceof Error ? error.message : String(error),
        },
      };
    }
  }

  /**
   * Executes the multi-step plan, processes natural language actions, and attaches
   * confirmation proposals or executes confirmed operations.
   */
  static async executePlan(
    message: string,
    context: AgentContext,
    actor?: Actor,
    history?: Array<{ role: "user" | "assistant"; content: string; confirmation?: CopilotConfirmation }>,
  ): Promise<AgentExecutionResult> {
    const { intent, steps, pendingConfirmation } = this.planIntent(message, context, history);
    const executed: AgentExecutionResult["stepsExecuted"] = [];
    const actions: CopilotAction[] = [];
    const sources: string[] = [];
    let confirmation: CopilotConfirmation | undefined;

    // Direct conversational execution of a pending confirmation card
    if (intent === "execute_pending_confirmation" && pendingConfirmation) {
      const activeActor: Actor = actor ?? { userId: "SYSTEM", role: context.role };
      const execution = await this.executeConfirmation(activeActor, {
        confirmationId: pendingConfirmation.id,
        actionType: pendingConfirmation.actionType,
        payload: pendingConfirmation.payload,
        decision: "confirm",
      });

      return {
        stepsExecuted: [],
        markdownAnswer: execution.success
          ? `✅ **Action Confirmed & Executed**\n\n${execution.data.message}`
          : `❌ **Execution Failed**\n\n${execution.data.message}`,
        actions: execution.data.actions ?? [],
        sources: ["Autonomous Confirmation Protocol"],
        confirmation: {
          ...pendingConfirmation,
          status: execution.success ? "executed" : "failed",
          resultMessage: execution.data.message,
        },
      };
    }

    // Direct conversational cancellation of a pending confirmation card
    if (intent === "cancel_pending_confirmation" && pendingConfirmation) {
      return {
        stepsExecuted: [],
        markdownAnswer: `🛑 **Action Cancelled**\n\nThe operation was aborted at your request. No database records or stock balances were modified.`,
        actions: [],
        sources: ["Autonomous Confirmation Protocol"],
        confirmation: {
          ...pendingConfirmation,
          status: "cancelled",
          resultMessage: "Cancelled by user",
        },
      };
    }

    // Destructive Intent: Propose Invoice Cancellation
    if (intent === "propose_cancel_invoice") {
      if (!can(context.role, "invoice.manage")) {
        return {
          stepsExecuted: [],
          markdownAnswer: `⚠️ **Permission Denied**\n\nYour current role (**${context.role}**) does not have permission to manage/cancel invoices (\`invoice.manage\`). Please request a Store Manager or Administrator.`,
          actions: [{ label: "View Invoices", route: "/invoices", permission: "invoice.view" }],
          sources: ["RBAC Enforcement Matrix"],
        };
      }

      const invMatch = message.match(/((?:DEMO-)?INV-[A-Za-z0-9-]+)/i) || message.match(/#?(\d+)/);
      const invoiceNumber = invMatch ? invMatch[1].toUpperCase() : null;

      const invoice = invoiceNumber
        ? await prisma.invoice.findFirst({
            where: {
              OR: [
                { invoiceNumber },
                { invoiceNumber: { contains: invoiceNumber, mode: "insensitive" } },
              ],
            },
            include: { customer: true, items: true, outwards: true },
          })
        : await prisma.invoice.findFirst({
            where: { status: "OPEN" },
            orderBy: { createdAt: "desc" },
            include: { customer: true, items: true, outwards: true },
          });

      if (!invoice) {
        return {
          stepsExecuted: [],
          markdownAnswer: `Could not locate the requested invoice. Please provide the invoice number (for example \`INV-2026-0001\` or \`DEMO-INV-001\`).`,
          actions: [{ label: "Browse Invoices", route: "/invoices", permission: "invoice.view" }],
          sources: ["Invoice Registry"],
        };
      }

      if (invoice.status === "CANCELLED") {
        return {
          stepsExecuted: [],
          markdownAnswer: `Invoice **\`${invoice.invoiceNumber}\`** is already marked as \`CANCELLED\`. No further action is required.`,
          actions: [{ label: "Open Invoice", route: `/invoices/${invoice.id}`, permission: "invoice.view" }],
          sources: ["Invoice Registry"],
        };
      }

      if (invoice.outwards.length > 0) {
        return {
          stepsExecuted: [],
          markdownAnswer: `⚠️ **Cannot Cancel Invoice Directly**\n\nInvoice **\`${invoice.invoiceNumber}\`** has **${invoice.outwards.length}** dispatch document(s) already posted against it. Dispatches must be reversed before the invoice can be cancelled.`,
          actions: [
            { label: "View Dispatches", route: "/dispatches", permission: "dispatch.view" },
            { label: "Open Invoice", route: `/invoices/${invoice.id}`, permission: "invoice.view" },
          ],
          sources: ["Invoice Registry & Outward Fulfillment"],
        };
      }

      const reasonMatch = message.match(/(?:reason|because|due to|kyuki|kyunki)\s+(.*)/i);
      const reason = reasonMatch ? reasonMatch[1].trim() : "Cancelled via Copilot confirmation";

      confirmation = {
        id: randomUUID(),
        title: `Cancel Invoice ${invoice.invoiceNumber}`,
        description: `Permanently cancel invoice ${invoice.invoiceNumber} for ${invoice.customer.name}. It will be marked as CANCELLED and no dispatches can be created against it.`,
        actionType: "CANCEL_INVOICE",
        payload: {
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          customerName: invoice.customer.name,
          reason,
        },
        destructive: true,
        confirmLabel: "Yes, Cancel Invoice",
        cancelLabel: "Nevermind, Keep It",
        alternatives: [
          { label: "Inspect Invoice", action: "NAVIGATE", payload: { route: `/invoices/${invoice.id}` } },
        ],
        status: "pending",
      };

      return {
        stepsExecuted: [],
        markdownAnswer: `### ⚠️ Confirmation Required: Cancel Invoice\n\nI found invoice **\`${invoice.invoiceNumber}\`** for **${invoice.customer.name}** (Status: \`OPEN\`).\n\n**Consequences of Cancellation:**\n- The invoice status becomes \`CANCELLED\` permanently.\n- Demand allocation is freed; no further dispatches can be generated.\n- This action is cryptographically logged under your user account for audit compliance.\n\nWould you like to proceed? You can click **"Yes, Cancel Invoice"** below, or reply **"yes, cancel it"** / **"no, keep it"**.`,
        actions: [
          { label: "Open Invoice Details", route: `/invoices/${invoice.id}`, permission: "invoice.view" },
        ],
        sources: ["Invoice Registry & Cancellation Rules"],
        confirmation,
      };
    }

    // Destructive Intent: Propose Purchase Order Cancellation
    if (intent === "propose_cancel_po") {
      if (!can(context.role, "po.manage")) {
        return {
          stepsExecuted: [],
          markdownAnswer: `⚠️ **Permission Denied**\n\nYour current role (**${context.role}**) does not have permission to manage purchase orders (\`po.manage\`).`,
          actions: [{ label: "View Purchase Orders", route: "/purchase-orders", permission: "po.view" }],
          sources: ["RBAC Enforcement Matrix"],
        };
      }

      const poMatch = message.match(/((?:DEMO-)?PO-[A-Za-z0-9-]+)/i) || message.match(/#?(\d+)/);
      const poNumber = poMatch ? poMatch[1].toUpperCase() : null;

      const po = poNumber
        ? await prisma.purchaseOrder.findFirst({
            where: {
              OR: [
                { poNumber },
                { poNumber: { contains: poNumber, mode: "insensitive" } },
              ],
            },
            include: { supplier: true, items: true, grns: true },
          })
        : await prisma.purchaseOrder.findFirst({
            where: { status: "OPEN" },
            orderBy: { createdAt: "desc" },
            include: { supplier: true, items: true, grns: true },
          });

      if (!po) {
        return {
          stepsExecuted: [],
          markdownAnswer: `Could not locate the purchase order. Please specify the PO number (for example \`PO-2026-0001\` or \`DEMO-PO-001\`).`,
          actions: [{ label: "Browse Purchase Orders", route: "/purchase-orders", permission: "po.view" }],
          sources: ["Purchasing Registry"],
        };
      }

      if (po.items.some((item) => Number(item.receivedQty) > 0)) {
        return {
          stepsExecuted: [],
          markdownAnswer: `⚠️ **PO Has Received Goods**\n\nPurchase order **\`${po.poNumber}\`** already has goods received against it. Orders with receipts cannot be cancelled outright, but you can **short-close** the remaining unreceived balance so no more shipments are accepted.`,
          actions: [
            { label: "Open Purchase Order", route: `/purchase-orders/${po.id}`, permission: "po.view" },
          ],
          sources: ["Procurement Lifecycle Invariants"],
        };
      }

      confirmation = {
        id: randomUUID(),
        title: `Cancel Purchase Order ${po.poNumber}`,
        description: `Cancel PO ${po.poNumber} for ${po.supplier.name}. No material receipts will be permitted.`,
        actionType: "CANCEL_PO",
        payload: {
          poId: po.id,
          poNumber: po.poNumber,
          supplierName: po.supplier.name,
          reason: "Cancelled via Copilot confirmation",
        },
        destructive: true,
        confirmLabel: "Yes, Cancel Order",
        cancelLabel: "Keep Order",
        status: "pending",
      };

      return {
        stepsExecuted: [],
        markdownAnswer: `### ⚠️ Confirmation Required: Cancel Purchase Order\n\nI located PO **\`${po.poNumber}\`** with supplier **${po.supplier.name}** (Status: \`${po.status}\`, Total: ${po.items.length} line items).\n\nCancelling this order will mark it \`CANCELLED\` and prevent warehouse GRN receipts.\n\nClick **"Yes, Cancel Order"** or reply **"yes" / "no"**.`,
        actions: [{ label: "Open PO Details", route: `/purchase-orders/${po.id}`, permission: "po.view" }],
        sources: ["Purchasing Registry"],
        confirmation,
      };
    }

    // Destructive Intent: Propose Sandbox Purge
    if (intent === "propose_purge_sandbox") {
      if (!can(context.role, "settings.manage")) {
        return {
          stepsExecuted: [],
          markdownAnswer: `⚠️ **Permission Denied**\n\nOnly Administrators (\`settings.manage\`) can purge demo sandbox test data.`,
          actions: [{ label: "View Live Stock", route: "/stock", permission: "stock.view" }],
          sources: ["RBAC Enforcement Matrix"],
        };
      }

      confirmation = {
        id: randomUUID(),
        title: "Clean Up Sandbox Demo Data",
        description: "Purge all DEMO-* test SKUs, stock balances, invoices, GRNs, and dispatches. Zero production records will be touched.",
        actionType: "PURGE_SANDBOX",
        payload: {},
        destructive: true,
        confirmLabel: "Yes, Purge Demo Data",
        cancelLabel: "Nevermind",
        status: "pending",
      };

      return {
        stepsExecuted: [],
        markdownAnswer: `### ⚠️ Confirmation Required: Sandbox Demo Purge\n\nThis will purge all demo sample records (including \`DEMO-BASMATI-01\`, demo godowns, and unlinked demo transactions).\n\n**Data Safety Guarantee:** Every production transaction, SKU, customer, and supplier is completely isolated and will not be touched.\n\nConfirm to proceed with clean up?`,
        actions: [{ label: "Onboarding Analytics", route: "/admin/onboarding", permission: "settings.manage" }],
        sources: ["Sandbox Isolation Controller"],
        confirmation,
      };
    }

    // Operational: Seed Sandbox
    if (intent === "execute_seed_sandbox") {
      const activeActor: Actor = actor ?? { userId: "SYSTEM", role: context.role };
      const seedResult = await seedSandboxData(activeActor);
      return {
        stepsExecuted: [],
        markdownAnswer: `🎉 **Sandbox Demo Environment Ready**\n\n${seedResult.message}\n\n- **Stock Added:** 100 bags Royal Basmati Rice in Demo Central Warehouse\n- **Sales Order:** Open invoice ready for FEFO dispatching\n- **Safety:** Tagged with \`DEMO-\` prefix for one-click clean up anytime.`,
        actions: [
          { label: "View Live Stock", route: "/stock", permission: "stock.view" },
          { label: "View Invoices", route: "/invoices", permission: "invoice.view" },
          { label: "Onboarding Analytics", route: "/admin/onboarding", permission: "settings.manage" },
        ],
        sources: ["Sandbox Engine"],
      };
    }

    // Operational: Propose Automated FEFO Dispatch
    if (intent === "propose_post_dispatch") {
      if (!can(context.role, "dispatch.create")) {
        return {
          stepsExecuted: [],
          markdownAnswer: `⚠️ **Permission Denied**\n\nYour role (${context.role}) does not have permission to post outward dispatches (\`dispatch.create\`).`,
          actions: [{ label: "View Invoices", route: "/invoices", permission: "invoice.view" }],
          sources: ["RBAC Enforcement Matrix"],
        };
      }

      const invMatch = message.match(/((?:DEMO-)?INV-[A-Za-z0-9-]+)/i);
      const invoice = invMatch
        ? await prisma.invoice.findFirst({
            where: { invoiceNumber: invMatch[1].toUpperCase() },
            include: { customer: true, items: { include: { sku: { include: { baseUom: true } } } } },
          })
        : await prisma.invoice.findFirst({
            where: { status: "OPEN" },
            orderBy: { createdAt: "desc" },
            include: { customer: true, items: { include: { sku: { include: { baseUom: true } } } } },
          });

      if (!invoice) {
        return {
          stepsExecuted: [],
          markdownAnswer: `Please specify the invoice number to dispatch (for example \`INV-2026-0001\` or \`DEMO-INV-001\`).`,
          actions: [{ label: "Browse Invoices", route: "/invoices", permission: "invoice.view" }],
          sources: ["Invoice Registry"],
        };
      }

      // Check available batches for lines using FEFO
      const readinessData = (await executeCopilotToolData(
        "check_dispatch_readiness",
        JSON.stringify({ invoiceNumber: invoice.invoiceNumber }),
        { role: context.role, route: context.route },
      )) as DispatchReadinessResult;

      if (readinessData.overallReadiness !== "READY_TO_DISPATCH") {
        return {
          stepsExecuted: [],
          markdownAnswer: `### Dispatch Cannot Be Completed\n\nInvoice **\`${invoice.invoiceNumber}\`** is not currently ready for full fulfillment:\n\n${readinessData.recommendedAction}`,
          actions: [
            { label: "Open Invoice", route: `/invoices/${invoice.id}`, permission: "invoice.view" },
            { label: "Check Stock Balances", route: "/stock", permission: "stock.view" },
          ],
          sources: ["FEFO Stock Readiness Evaluator"],
        };
      }

      // Resolve godown and batch lines
      const activeGodown = await prisma.godown.findFirst({ where: { isActive: true } });
      if (!activeGodown) {
        return {
          stepsExecuted: [],
          markdownAnswer: `No active warehouse godowns found to dispatch from.`,
          actions: [{ label: "Manage Godowns", route: "/masters/godowns", permission: "master.view" }],
          sources: ["Godown Master"],
        };
      }

      const dispatchLines: Array<{ skuId: string; batchId: string; quantity: string }> = [];
      for (const item of invoice.items) {
        const remaining = Number(item.quantity) - Number(item.dispatchedQty);
        if (remaining <= 0) continue;
        const availableBatch = await prisma.stockBalance.findFirst({
          where: {
            skuId: item.skuId,
            quantity: { gte: toDecimal(remaining) },
          },
          include: { batch: true },
          orderBy: { batch: { expiryDate: "asc" } },
        });

        if (availableBatch) {
          dispatchLines.push({
            skuId: item.skuId,
            batchId: availableBatch.batchId,
            quantity: String(remaining),
          });
        }
      }

      if (dispatchLines.length === 0) {
        return {
          stepsExecuted: [],
          markdownAnswer: `Stock allocation could not find single batch covering lines. Please allocate manually via the dispatch form.`,
          actions: [
            {
              label: "Create Manual Dispatch",
              route: "/dispatches/new",
              params: { invoiceId: invoice.id },
              permission: "dispatch.create",
            },
          ],
          sources: ["FEFO Allocation Engine"],
        };
      }

      confirmation = {
        id: randomUUID(),
        title: `Confirm Outward Dispatch: ${invoice.invoiceNumber}`,
        description: `Dispatch invoice ${invoice.invoiceNumber} to ${invoice.customer.name} from ${activeGodown.name} using automated FEFO batch allocation.`,
        actionType: "POST_DISPATCH",
        payload: {
          invoiceId: invoice.id,
          godownId: activeGodown.id,
          items: dispatchLines,
        },
        destructive: false,
        confirmLabel: "Confirm & Post Dispatch",
        cancelLabel: "Cancel",
        status: "pending",
      };

      return {
        stepsExecuted: [],
        markdownAnswer: `### ⚡ FEFO Dispatch Allocation Prepared\n\nOptimal batch picking calculated for **\`${invoice.invoiceNumber}\`** (${invoice.customer.name}):\n\n- **Source Godown:** \`${activeGodown.code}\` — ${activeGodown.name}\n- **Allocated Lines:** ${dispatchLines.length} item(s) mapped to earliest-expiring unexpired batches.\n\nPosting this will deduct inventory from the signed ledger and generate Delivery Challan.\n\nClick **"Confirm & Post Dispatch"** or reply **"confirm / yes"** to proceed.`,
        actions: [
          { label: "Inspect Invoice", route: `/invoices/${invoice.id}`, permission: "invoice.view" },
        ],
        sources: ["FEFO Stock Picking Protocol"],
        confirmation,
      };
    }

    // Standard analytical & informational multi-step tools execution
    for (const step of steps) {
      try {
        const parsed = await executeCopilotToolData(step.toolName, JSON.stringify(step.arguments), {
          role: context.role,
          route: context.route,
        });
        executed.push({
          toolName: step.toolName,
          description: step.description,
          output: parsed,
        });
      } catch (err) {
        executed.push({
          toolName: step.toolName,
          description: step.description,
          output: { error: err instanceof Error ? err.message : String(err) },
        });
      }
    }

    let markdown = "";

    switch (intent) {
      case "fefo_allocation": {
        const fefo = executed.find((e) => e.toolName === "get_fefo_pick_list")?.output as FefoResult | undefined;
        if (!fefo || fefo.error) {
          markdown = `### FEFO Allocation Status\n\nCould not compute batch allocation: **${fefo?.error || "Unknown error"}**.\n\nPlease check the product name or code.`;
          actions.push({ label: "Browse Product Master", route: "/masters/skus", permission: "master.view" });
          break;
        }

        markdown = `## Optimal FEFO Pick List: ${fefo.product.name} (\`${fefo.product.code}\`)\n\n`;
        markdown += `**Requested Quantity:** ${fefo.requestedQty} ${fefo.product.unit} | **Allocated:** ${fefo.allocatedQty} ${fefo.product.unit}\n\n`;

        if (fefo.status === "SHORTAGE") {
          markdown += `⚠️ **Stock Shortfall Warning:** Short by **${fefo.shortfallQty} ${fefo.product.unit}**! Total warehouse unexpired stock is ${fefo.warehouseAvailableQty ?? "0"} ${fefo.product.unit}.\n\n`;
        } else {
          markdown += `✅ **Fully Allocatable:** Sufficient unexpired batch stock is ready in warehouse godowns.\n\n`;
        }

        markdown += `| Pick Priority | Batch Number | Godown | Expiry Date | Available | Pick Qty |\n`;
        markdown += `| :---: | :--- | :--- | :---: | :---: | :---: |\n`;
        fefo.pickList.forEach((pick, idx) => {
          markdown += `| **#${idx + 1}** | \`${pick.batch}\` | \`${pick.godown}\` | ${pick.expiryDate || "No Expiry"} | ${pick.availableQty} | **${pick.pickQty} ${fefo.product.unit}** |\n`;
        });

        markdown += `\n**Protocol Recommendation:** ${fefo.recommendation}\n`;

        actions.push({
          label: "Create Outward Dispatch",
          route: "/dispatches/new",
          permission: "dispatch.create",
        });
        actions.push({ label: "Check Stock Balances", route: "/stock", permission: "stock.view" });
        sources.push("FEFO Dynamic Allocation Engine (First-Expired, First-Out)");
        break;
      }

      case "dispatch_readiness": {
        const readiness = executed.find((e) => e.toolName === "check_dispatch_readiness")?.output as DispatchReadinessResult | undefined;
        if (!readiness || readiness.error) {
          markdown =
            steps.length === 0
              ? "### Dispatch Readiness Verification\n\nPlease mention the invoice number (for example `INV-2026-0001` or `DEMO-INV-001`) to check unexpired stock across godowns."
              : `### Dispatch Readiness Verification\n\n${readiness?.error || "Invoice not found"}. Please check the invoice number (e.g. \`INV-2026-0001\`).`;
          actions.push({ label: "View All Invoices", route: "/invoices", permission: "invoice.view" });
          break;
        }

        const isCancelled = readiness.overallReadiness === "CANCELLED";
        const isFullyDispatched = readiness.overallReadiness === "FULLY_DISPATCHED";
        const isReady = readiness.overallReadiness === "READY_TO_DISPATCH";

        markdown = `## Dispatch Readiness: Invoice ${readiness.invoiceNumber}\n\n`;
        markdown += `**Customer:** ${readiness.customer} | **Invoice Status:** \`${readiness.invoiceStatus}\`\n`;
        markdown += `**Readiness Status:** ${
          isCancelled
            ? "🛑 **CANCELLED**"
            : isFullyDispatched
              ? "✅ **ALREADY FULLY DISPATCHED**"
              : isReady
                ? "🟢 **READY TO DISPATCH**"
                : "🔴 **STOCK SHORTAGE**"
        }\n\n`;

        if (readiness.recommendedGodown) {
          markdown += `**Recommended Godown:** \`${readiness.recommendedGodown}\` (Covers all required lines)\n\n`;
        }

        markdown += `| Item | Billed | Dispatched | Remaining | Unexpired Stock | Status |\n`;
        markdown += `| :--- | :---: | :---: | :---: | :---: | :---: |\n`;
        for (const line of readiness.lines) {
          markdown += `| **${line.product}** | ${line.billed} | ${line.dispatched} | **${line.remaining}** | ${line.availableUnexpiredStock} | ${line.status === "READY" ? "✅ Ready" : "⚠️ Shortage"} |\n`;
        }

        markdown += `\n**Operational Guidance:** ${readiness.recommendedAction}\n`;

        if (isReady) {
          actions.push({
            label: "Create Outward Dispatch",
            route: "/dispatches/new",
            params: { invoiceId: readiness.invoiceId },
            permission: "dispatch.create",
          });
        } else if (!isFullyDispatched && !isCancelled) {
          actions.push({ label: "Create Purchase Order", route: "/purchase-orders/new", permission: "po.manage" });
        }
        actions.push({ label: "Inspect Invoices", route: "/invoices", permission: "invoice.view" });
        sources.push("Real-time Inward Ledger & Invoice Line Registry");
        break;
      }

      case "expiring_batches": {
        const batchData = executed.find((e) => e.toolName === "check_expiring_batches")?.output as ExpiringBatchesResult | undefined;
        const batches = batchData?.batches || [];
        const days = batchData?.timeframeDays ?? 60;

        markdown = `## Shelf-Life & Expiry Risk Analysis (${days} Days Window)\n\n`;
        markdown += `Found **${batches.length}** batch(es) nearing expiration or expired:\n\n`;

        if (batches.length > 0) {
          for (const b of batches) {
            const tone =
              b.daysLeft < 0
                ? "🚨 **EXPIRED**"
                : b.daysLeft === 0
                  ? "⚠️ **EXPIRES TODAY**"
                  : b.daysLeft <= 30
                    ? "⚠️ **CRITICAL (< 30d)**"
                    : "🕒 **APPROACHING**";
            markdown += `- ${tone} **\`${b.batch}\`** — ${b.product}\n`;
            markdown += `  - Godown: **\`${b.godown}\`** | Current Stock: **${b.quantity} ${b.unit}**\n`;
            markdown += `  - Expiry Date: **${b.expiryDate}** (${b.daysLeft < 0 ? "Expired" : b.daysLeft === 0 ? "Expires today" : `${b.daysLeft} days remaining`})\n`;
          }
          markdown += `\n**FEFO Protocol Notice:** Prioritize near-expiry batches on outward dispatches to minimize inventory obsolescence. Expired batches cannot be dispatched and must be quarantined via inventory adjustment.\n`;
        } else {
          markdown += `✅ **Zero shelf-life risk detected!** All current batch inventory across godowns has safe expiry buffers exceeding ${days} days.\n`;
        }

        actions.push({ label: "View Live Stock", route: "/stock", permission: "stock.view" });
        actions.push({ label: "Stock Adjustments", route: "/adjustments/new", permission: "adjustment.request" });
        sources.push("Batch Master & FEFO Lifecycle Engine");
        break;
      }

      case "ledger_audit": {
        const ledgerData = executed.find((e) => e.toolName === "get_recent_ledger_movements")?.output as LedgerResult | undefined;
        const rows = ledgerData?.movements || [];

        markdown = `## Signed Double-Entry Inventory Ledger Movements\n\n`;
        markdown += `Showing **${rows.length}** most recent cryptographic audit entries:\n\n`;

        if (rows.length > 0) {
          markdown += `| Entry No | Movement | Product | Godown | Quantity | Balance After | Document |\n`;
          markdown += `| :--- | :---: | :--- | :--- | :---: | :---: | :---: |\n`;
          for (const r of rows) {
            const sign = r.movementType === "INWARD" ? "+" : r.movementType === "OUTWARD" ? "-" : "";
            markdown += `| \`${r.entryNo}\` | **${r.movementType}** | ${r.product} | \`${r.godown}\` | **${sign}${r.quantity}** | ${r.balanceAfter} | \`${r.reference}\` |\n`;
          }
        } else {
          markdown += `_No ledger movements recorded matching the given criteria._\n`;
        }

        markdown += `\n**Integrity Guarantee:** Every movement is sequentially signed and immutable. Balance queries compute exact mathematical sums across the ledger.\n`;

        actions.push({ label: "Open Full Ledger Audit Trail", route: "/ledger", permission: "ledger.view" });
        sources.push("Immutable Double-Entry Ledger (inventory_ledger)");
        break;
      }

      case "document_status": {
        const docData = executed.find((e) => e.toolName === "get_document_status")?.output as DocumentStatusResult | undefined;
        if (!docData || docData.error) {
          markdown =
            steps.length === 0
              ? "### Document Tracking\n\nMention the document number (for example `PO-2026-0001`, `INV-2026-0001` or `DC-2026-0001`) and I will fetch its live status."
              : `### Document Tracking\n\n${docData?.error || "Document not found"}.`;
          if (steps.length === 0) {
            actions.push({ label: "Open Purchase Orders", route: "/purchase-orders", permission: "po.view" });
            actions.push({ label: "Open Invoices", route: "/invoices", permission: "invoice.view" });
            actions.push({ label: "Open Dispatches", route: "/dispatches", permission: "dispatch.view" });
          }
          break;
        }

        if (docData.type === "purchase_order") {
          markdown = `## Purchase Order: ${docData.number}\n\n`;
          markdown += `**Supplier:** ${docData.party} | **Status:** \`${docData.status}\`\n\n`;
          markdown += `### Line Items:\n`;
          for (const l of docData.lines || []) {
            markdown += `- **${l.product}**: Ordered **${l.ordered}**, Received **${l.received}** (Pending: **${l.pending} ${l.unit}**)\n`;
          }
          if (docData.receipts && docData.receipts.length > 0) {
            markdown += `\n### Linked Receipts (GRNs):\n`;
            for (const g of docData.receipts) {
              markdown += `- GRN \`${g.number}\` at Godown \`${g.godown}\` (${g.status})\n`;
            }
          }
          actions.push({
            label: "Open Purchase Order",
            route: docData.id ? `/purchase-orders/${docData.id}` : "/purchase-orders",
            permission: "po.view",
          });
        } else if (docData.type === "invoice") {
          markdown = `## Sales Invoice: ${docData.number}\n\n`;
          markdown += `**Customer:** ${docData.party} | **Status:** \`${docData.status}\` | **Date:** ${docData.date}\n\n`;
          markdown += `### Invoiced Items:\n`;
          for (const l of docData.lines || []) {
            markdown += `- **${l.product}**: Billed **${l.billed}**, Dispatched **${l.dispatched}** (Remaining: **${l.remaining} ${l.unit}**)\n`;
          }
          if (docData.id) {
            actions.push({
              label: "Open Invoice",
              route: `/invoices/${docData.id}`,
              permission: "invoice.view",
            });
          }
          if (docData.id && docData.status !== "CANCELLED" && docData.status !== "COMPLETE") {
            actions.push({
              label: "Create Dispatch Outward",
              route: "/dispatches/new",
              params: { invoiceId: docData.id },
              permission: "dispatch.create",
            });
          }
          actions.push({ label: "View Invoices", route: "/invoices", permission: "invoice.view" });
        } else {
          markdown = `## Dispatch Outward: ${docData.number}\n\n`;
          markdown += `**Customer:** ${docData.party ?? "N/A"} | **Status:** \`${docData.status}\`\n\n`;
          markdown += `### Dispatched Batches:\n`;
          for (const l of docData.lines || []) {
            markdown += `- **${l.product}**: Batch \`${l.batch}\` (Exp: ${l.expiryDate || "None"}), Qty: **${l.quantity} ${l.baseUnit}**\n`;
          }
          actions.push({
            label: "Open Dispatch",
            route: docData.id ? `/dispatches/${docData.id}` : "/dispatches",
            permission: "dispatch.view",
          });
        }
        sources.push("Operational Document Registry");
        break;
      }

      case "low_stock_reorder": {
        const alertData = executed.find((e) => e.toolName === "get_low_stock_alerts")?.output as StockAlertsResult | undefined;
        const reorderData = executed.find((e) => e.toolName === "get_reorder_recommendations")?.output as ReorderResult | undefined;

        markdown = `## Inventory Replenishment & Reorder Analysis\n\n`;
        markdown += `Active Stock Alerts: **${alertData?.count ?? 0}** | Replenishment Needed: **${reorderData?.count ?? 0}** items\n\n`;

        if (reorderData && reorderData.recommendations.length > 0) {
          markdown += `| Product | Godown | Current Stock | Safety Threshold | Recommended Order |\n`;
          markdown += `| :--- | :--- | :---: | :---: | :---: |\n`;
          for (const r of reorderData.recommendations) {
            markdown += `| **${r.product}** | \`${r.godown}\` | ${r.currentStock} ${r.unit} | ${r.reorderLevel} ${r.unit} | **${r.recommendedMinimumOrder} ${r.unit}** |\n`;
          }
          markdown += `\n**Replenishment Action:** Stock levels have breached reorder points. Raise Purchase Orders to avoid dispatch blockages.\n`;
        } else {
          markdown += `✅ All active products currently meet or exceed configured reorder safety levels.\n`;
        }

        actions.push({ label: "Create Purchase Order", route: "/purchase-orders/new", permission: "po.manage" });
        actions.push({ label: "Stock Alerts Overview", route: "/dashboard", permission: "dashboard.view" });
        sources.push("Automated Reorder Rule Engine & Alert Monitor");
        break;
      }

      case "godowns": {
        const gData = executed.find((e) => e.toolName === "get_godowns")?.output as GodownResult | undefined;
        const list = gData?.godowns || [];

        markdown = `## Active Warehouse Godowns & Storage Locations\n\n`;
        markdown += `Registered active godowns: **${list.length}**\n\n`;

        for (const g of list) {
          markdown += `- 🏬 **\`${g.code}\`** — **${g.name}**\n`;
          markdown += `  - Address: ${g.address || "Main Warehouse Facility"} | Tally Sync: ${g.tallySyncEnabled ? "Enabled" : "Disabled"}\n`;
          markdown += `  - Active Stock Lines: **${g.activeStockLines}** distinct product-batch rows on hand\n`;
        }

        actions.push({ label: "Manage Godowns", route: "/masters/godowns", permission: "master.view" });
        actions.push({ label: "View Godown Stock", route: "/stock", permission: "stock.view" });
        sources.push("Godown Master Registry");
        break;
      }

      case "stock_check": {
        const sData = executed.find((e) => e.toolName === "check_stock")?.output as StockResult | undefined;
        if (!sData || sData.error) {
          markdown = `### Stock Lookup\n\nCould not fetch stock: **${sData?.error || "Product not found"}**.`;
          actions.push({ label: "Browse Product Master", route: "/masters/skus", permission: "master.view" });
          break;
        }

        const gCode = typeof sData.godown === "string" ? sData.godown : sData.godown?.code;
        markdown = `## Stock Balances: ${sData.product.name} (\`${sData.product.code}\`)\n\n`;
        markdown += `**Total On-Hand Inventory:** **${sData.totalQuantity} ${sData.product.baseUnit}** across godowns (Filter: \`${gCode}\`)\n\n`;

        if (sData.batches && sData.batches.length > 0) {
          markdown += `### Batch & Shelf-Life Breakdown:\n`;
          markdown += `| Godown | Batch Number | Expiry Date | Quantity | Status |\n`;
          markdown += `| :--- | :--- | :---: | :---: | :---: |\n`;
          for (const b of sData.batches) {
            markdown += `| \`${b.godown}\` | \`${b.batch}\` | ${b.expiryDate || "None"} | **${b.quantity} ${sData.product.baseUnit}** | ${b.expired ? "🚨 Expired" : "✅ Available"} |\n`;
          }
        } else {
          markdown += `_No active inventory stock currently on hand._\n`;
        }

        actions.push({ label: "Create Outward Dispatch", route: "/dispatches/new", permission: "dispatch.create" });
        actions.push({ label: "Create Purchase Order", route: "/purchase-orders/new", permission: "po.manage" });
        actions.push({ label: "View Ledger History", route: "/ledger", permission: "ledger.view" });
        sources.push("Live Stock Balance & Cryptographic Ledger");
        break;
      }

      default: {
        const counts = await getWorkspaceCounts();
        const curated = answerFromKnowledge(message, { route: context.route, role: context.role }, counts);
        markdown = curated.answer;
        actions.push(...curated.actions);
        sources.push(...curated.sources);
        break;
      }
    }

    const allowed = actions.filter((act) => !act.permission || can(context.role, act.permission));

    return {
      stepsExecuted: executed,
      markdownAnswer: markdown,
      actions: allowed,
      sources,
      confirmation,
    };
  }

  /**
   * Streams the multi-step agent execution progress, final answer, and confirmation
   * proposal as progressive SSE events.
   */
  static executeAutonomousAgentStream(
    message: string,
    context: AgentContext,
    actor?: Actor,
    history?: Array<{ role: "user" | "assistant"; content: string; confirmation?: CopilotConfirmation }>,
  ): ReadableStream<Uint8Array> {
    return new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          const { steps, intent } = AutonomousAgentService.planIntent(message, context, history);

          // If multi-step operational task, send a brief status indicator
          if (steps.length > 1) {
            controller.enqueue(
              sseEvent({
                delta: `⚡ _Autonomous Agent: Formulated ${steps.length}-step plan across ${steps.map((s) => s.name).join(" ➔ ")}_\n\n`,
              }),
            );
            await new Promise((r) => setTimeout(r, 60));
          } else if (intent.startsWith("propose_")) {
            controller.enqueue(
              sseEvent({
                delta: `🔍 _Evaluating operational prerequisites & building safety confirmation proposal..._\n\n`,
              }),
            );
            await new Promise((r) => setTimeout(r, 40));
          }

          const result = await AutonomousAgentService.executePlan(message, context, actor, history);

          // Stream answer in chunks for progressive typing feel
          const fullText = result.markdownAnswer;
          let offset = 0;
          while (offset < fullText.length) {
            const size = 24 + Math.floor(Math.random() * 24);
            const delta = fullText.slice(offset, offset + size);
            offset += size;
            controller.enqueue(sseEvent({ delta }));
            await new Promise((r) => setTimeout(r, 10));
          }

          controller.enqueue(
            sseEvent({
              done: true,
              actions: result.actions,
              sources: result.sources,
              confirmation: result.confirmation,
            }),
          );
          controller.close();
        } catch (error) {
          const fallback = `An unexpected error occurred during autonomous execution: ${error instanceof Error ? error.message : String(error)}`;
          controller.enqueue(sseEvent({ delta: fallback }));
          controller.enqueue(sseEvent({ done: true, actions: [], sources: [] }));
          controller.close();
        }
      },
    });
  }
}
