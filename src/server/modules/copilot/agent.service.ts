import type { RoleCode } from "@prisma/client";
import type { CopilotAction } from "@/lib/copilot/types";
import { executeCopilotTool } from "./tools";
import { getWorkspaceCounts } from "./copilot.queries";
import { answerFromKnowledge } from "./knowledge";
import { can } from "@/lib/permissions";

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
}

interface FefoResult {
  error?: string;
  product: { code: string; name: string; unit: string };
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
  invoiceNumber: string;
  customer: string;
  invoiceStatus: string;
  overallReadiness: string;
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
  number: string;
  status: string;
  party: string;
  date: string | null;
  lines?: Array<{
    product: string;
    ordered?: string;
    received?: string;
    pending?: string;
    billed?: string;
    dispatched?: string;
    remaining?: string;
    quantity?: string;
    baseUnit?: string;
    unit?: string;
    batch?: string;
    expiryDate?: string | null;
  }>;
  receipts?: Array<{ number: string; godown: string; status: string }>;
  godown?: string;
  invoice?: string | null;
}

interface AlertResult {
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
 * Runs end-to-end multi-step tool calls directly against PostgreSQL, evaluates
 * FEFO picking, ledger movements, document statuses, and dispatch readiness,
 * generating verified operational answers and executable UI actions.
 */
export class AutonomousAgentService {
  /**
   * Identifies the user's operational intent and generates a multi-step plan.
   */
  static planIntent(message: string, context?: AgentContext): { intent: string; steps: AgentPlanStep[] } {
    const text = message.toLowerCase();
    const onInvoiceRoute = Boolean(context?.route?.startsWith("/invoices"));

    // 1. FEFO Pick List / Batch Allocation
    if (
      text.includes("fefo") ||
      text.includes("pick list") ||
      text.includes("pick batch") ||
      text.includes("allocate batch") ||
      text.includes("batch allocation")
    ) {
      const qtyMatch = message.match(/(\d+(?:\.\d+)?)\s*(?:bags?|kg|units?|boxes?|pcs?|nos?)?/i);
      const quantity = qtyMatch ? parseFloat(qtyMatch[1]) : 10;
      const cleanProduct = message
        .replace(/(?:fefo|pick\s*list|pick\s*batch|allocate\s*batch|batch\s*allocation|for|of|can\s*we|please|give\s*me|generate|\d+(?:\.\d+)?\s*(?:bags?|kg|units?|boxes?|pcs?|nos?)?)/gi, "")
        .trim() || "Basmati";

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

    // 2. Dispatch Readiness Check (Invoice or Product)
    const invMatch = message.match(/(INV-[A-Za-z0-9-]+)/i);
    if (
      invMatch ||
      text.includes("dispatch readiness") ||
      text.includes("ready to dispatch") ||
      text.includes("can we dispatch") ||
      text.includes("fulfill invoice") ||
      (text.includes("dispatch") && onInvoiceRoute)
    ) {
      const invoiceNumber = invMatch ? invMatch[1].toUpperCase() : "INV-2026-0001";
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

    // 3. Expiring Batches / Shelf-life Risk Analysis
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

    // 4. Immutable Inventory Ledger Audit Movements
    if (
      text.includes("ledger") ||
      text.includes("audit") ||
      text.includes("movement") ||
      text.includes("signed entry") ||
      text.includes("transactions") ||
      text.includes("le-")
    ) {
      const docMatch = message.match(/((?:PO|INV|DC|GRN)-[A-Za-z0-9-]+)/i);
      const referenceNo = docMatch ? docMatch[1].toUpperCase() : undefined;
      const cleanProduct = !referenceNo
        ? message.replace(/(?:ledger|audit|movement|movements|signed|entries|entry|transactions|history|show|view|get|for|of)/gi, "").trim()
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

    // 5. Document Status Tracking (PO, Invoice, Dispatch, GRN)
    const poMatch = message.match(/(PO-[A-Za-z0-9-]+)/i);
    const dcMatch = message.match(/(DC-[A-Za-z0-9-]+)/i);
    if (poMatch || text.includes("purchase order") || text.includes(" po ")) {
      const number = poMatch ? poMatch[1].toUpperCase() : "PO-2026-0001";
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
    if (dcMatch || text.includes("dispatch document") || text.includes("outward")) {
      const number = dcMatch ? dcMatch[1].toUpperCase() : "DC-2026-0001";
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

    // 6. Low Stock Alerts & Reorder Replenishment
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

    // 7. Godown Capacities and Locations
    if (text.includes("godown") || text.includes("warehouse") || text.includes("depot")) {
      return {
        intent: "godowns",
        steps: [
          {
            name: "List Godowns & Storage Lines",
            toolName: "get_godowns",
            arguments: { limit: 10 },
            description: "Querying active godowns, locations, and active stock counts",
          },
        ],
      };
    }

    // 8. General Stock Check for a Product
    if (
      text.includes("stock") ||
      text.includes("inventory") ||
      text.includes("on hand") ||
      text.includes("available") ||
      text.includes("how many") ||
      text.includes("balance")
    ) {
      const clean = message
        .replace(/(?:stock|inventory|on\s*hand|available|how\s*many|balance|check|find|what\s*is\s*the|of|for|in)/gi, "")
        .trim() || "Basmati";

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
   * Executes the multi-step plan and synthesizes a comprehensive response.
   */
  static async executePlan(
    message: string,
    context: AgentContext,
  ): Promise<AgentExecutionResult> {
    const { intent, steps } = this.planIntent(message, context);
    const executed: AgentExecutionResult["stepsExecuted"] = [];
    const actions: CopilotAction[] = [];
    const sources: string[] = [];

    for (const step of steps) {
      try {
        const rawJson = await executeCopilotTool(step.toolName, JSON.stringify(step.arguments), {
          role: context.role,
          route: context.route,
        });
        const parsed = JSON.parse(rawJson);
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
        const pickData = executed.find((e) => e.toolName === "get_fefo_pick_list")?.output as FefoResult | undefined;
        if (!pickData || pickData.error) {
          markdown = `### FEFO Allocation Status\n\nCould not compute batch allocation: **${pickData?.error || "Product not found"}**.\n\nPlease check the product name or code.`;
          actions.push({ label: "Browse Product Master", route: "/masters/skus", permission: "master.view" });
          break;
        }

        const isOk = pickData.status === "FULLY_ALLOCATED";
        markdown = `## FEFO Batch Allocation Plan: ${pickData.product.code}\n\n`;
        markdown += `**Product:** ${pickData.product.name} (${pickData.product.code})\n`;
        markdown += `**Target Quantity:** ${pickData.requestedQty} ${pickData.product.unit}\n`;
        markdown += `**Status:** ${isOk ? "✅ **FULLY ALLOCATED**" : "⚠️ **STOCK SHORTAGE**"}\n`;
        markdown += `**Allocated:** ${pickData.allocatedQty} ${pickData.product.unit} | **Shortfall:** ${pickData.shortfallQty} ${pickData.product.unit}\n\n`;
        markdown += `### Recommended Pick Sequence (Earliest Expiry First):\n`;

        if (pickData.pickList && pickData.pickList.length > 0) {
          for (const [idx, b] of pickData.pickList.entries()) {
            markdown += `${idx + 1}. **Batch \`${b.batch}\`** in Godown **\`${b.godown}\`**:\n`;
            markdown += `   - Pick: **${b.pickQty} ${pickData.product.unit}**\n`;
            markdown += `   - Expiry Date: **${b.expiryDate || "No Expiry Tracked"}**\n`;
            markdown += `   - Available in Batch: ${b.availableQty} (Remaining: ${b.remainingInBatch})\n`;
          }
        } else {
          markdown += `_No unexpired batches with stock available in selected warehouse._\n`;
        }

        markdown += `\n**Operational Guidance:** ${pickData.recommendation}\n`;

        actions.push({ label: "Create Outward Dispatch", route: "/dispatch/new", permission: "dispatch.create" });
        actions.push({ label: "View Stock Ledger", route: "/stock/ledger", permission: "ledger.view" });
        sources.push("Live Stock Balance & Batch Expiry Index");
        break;
      }

      case "dispatch_readiness": {
        const readiness = executed.find((e) => e.toolName === "check_dispatch_readiness")?.output as DispatchReadinessResult | undefined;
        if (!readiness || readiness.error) {
          markdown = `### Dispatch Readiness Verification\n\n${readiness?.error || "Invoice not found"}.\n\nPlease ensure the invoice number is valid (e.g., INV-2026-0001).`;
          actions.push({ label: "View All Invoices", route: "/invoices", permission: "invoice.view" });
          break;
        }

        const isReady = readiness.overallReadiness === "READY_TO_DISPATCH";
        markdown = `## Dispatch Readiness Check: ${readiness.invoiceNumber}\n\n`;
        markdown += `**Customer:** ${readiness.customer}\n`;
        markdown += `**Invoice Status:** \`${readiness.invoiceStatus}\`\n`;
        markdown += `**Readiness Verdict:** ${isReady ? "✅ **READY TO DISPATCH** (100% Stock Available)" : "⚠️ **STOCK SHORTAGE DETECTED**"}\n\n`;
        markdown += `### Line-by-Line Stock Feasibility:\n`;

        for (const line of readiness.lines || []) {
          const lineIcon = line.status === "READY" ? "✅" : line.status === "ALREADY_DISPATCHED" ? "📦" : "❌";
          markdown += `- ${lineIcon} **${line.product}**:\n`;
          markdown += `  - Billed: ${line.billed} | Dispatched: ${line.dispatched} | Remaining to Dispatch: **${line.remaining} ${line.unit || ""}**\n`;
          markdown += `  - Available Unexpired Stock: **${line.availableUnexpiredStock} ${line.unit || ""}** (${line.status})\n`;
        }

        markdown += `\n**Recommendation:** ${readiness.recommendedAction}\n`;

        if (isReady) {
          actions.push({
            label: "Create Outward Dispatch",
            route: "/dispatch/new",
            params: { invoiceNumber: readiness.invoiceNumber },
            permission: "dispatch.create",
          });
        } else {
          actions.push({ label: "Create Purchase Order", route: "/purchasing/new", permission: "po.manage" });
        }
        actions.push({ label: "Inspect Invoices", route: "/invoices", permission: "invoice.view" });
        sources.push("Real-time Inward Ledger & Invoice Line Registry");
        break;
      }

      case "expiring_batches": {
        const expData = executed.find((e) => e.toolName === "check_expiring_batches")?.output as ExpiringBatchesResult | undefined;
        const batches = expData?.batches || [];

        markdown = `## Shelf-Life & Expiry Risk Analysis (${expData?.timeframeDays || 60} Days Window)\n\n`;
        markdown += `Found **${batches.length}** batch(es) nearing expiration or expired:\n\n`;

        if (batches.length > 0) {
          for (const b of batches) {
            const tone = b.daysLeft <= 0 ? "🚨 **EXPIRED**" : b.daysLeft <= 30 ? "⚠️ **CRITICAL (< 30d)**" : "🕒 **APPROACHING**";
            markdown += `- ${tone} **\`${b.batch}\`** — ${b.product}\n`;
            markdown += `  - Godown: **\`${b.godown}\`** | Current Stock: **${b.quantity} ${b.unit}**\n`;
            markdown += `  - Expiry Date: **${b.expiryDate}** (${b.daysLeft <= 0 ? "Expired" : `${b.daysLeft} days remaining`})\n`;
          }
          markdown += `\n**FEFO Protocol Notice:** Prioritize near-expiry batches on outward dispatches to minimize inventory obsolescence. Expired batches cannot be dispatched and must be quarantined via inventory adjustment.\n`;
        } else {
          markdown += `✅ **Zero shelf-life risk detected!** All current batch inventory across godowns has safe expiry buffers exceeding ${expData?.timeframeDays || 60} days.\n`;
        }

        actions.push({ label: "View Live Stock", route: "/stock", permission: "stock.view" });
        actions.push({ label: "Stock Adjustments", route: "/adjustments/new", permission: "adjustment.request" });
        sources.push("Batch Master & FEFO Lifecycle Engine");
        break;
      }

      case "ledger_audit": {
        const ledgerData = executed.find((e) => e.toolName === "get_recent_ledger_movements")?.output as LedgerResult | undefined;
        const movements = ledgerData?.movements || [];

        markdown = `## Signed Double-Entry Inventory Ledger Movements\n\n`;
        markdown += `Showing **${movements.length}** most recent cryptographic audit entries:\n\n`;

        if (movements.length > 0) {
          for (const m of movements) {
            const sign = m.quantity.startsWith("-") ? "🔻" : "🟢";
            markdown += `- **\`${m.entryNo}\`** ${sign} **${m.movementType}** of **${m.quantity}** for ${m.product}\n`;
            markdown += `  - Batch: **\`${m.batch}\`** | Godown: **\`${m.godown}\`** | Balance After: **${m.balanceAfter}**\n`;
            markdown += `  - Reference: \`${m.reference}\` | Recorded: ${m.timestamp.slice(0, 16).replace("T", " ")}\n`;
          }
        } else {
          markdown += `_No ledger movements recorded matching the given criteria._\n`;
        }

        markdown += `\n**Integrity Guarantee:** Every movement is sequentially signed and immutable. Balance queries compute exact mathematical sums across the ledger.\n`;

        actions.push({ label: "Open Full Ledger Audit Trail", route: "/stock/ledger", permission: "ledger.view" });
        sources.push("Immutable Double-Entry Ledger (inventory_ledger)");
        break;
      }

      case "document_status": {
        const docData = executed.find((e) => e.toolName === "get_document_status")?.output as DocumentStatusResult | undefined;
        if (!docData || docData.error) {
          markdown = `### Document Tracking\n\n${docData?.error || "Document not found"}.`;
          break;
        }

        if (docData.type === "purchase_order") {
          markdown = `## Purchase Order: ${docData.number}\n\n`;
          markdown += `**Supplier:** ${docData.party} | **Status:** \`${docData.status}\` | **Order Date:** ${docData.date}\n\n`;
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
          actions.push({ label: "Open Purchase Orders", route: "/purchasing", permission: "po.view" });
        } else if (docData.type === "invoice") {
          markdown = `## Sales Invoice: ${docData.number}\n\n`;
          markdown += `**Customer:** ${docData.party} | **Status:** \`${docData.status}\` | **Date:** ${docData.date}\n\n`;
          markdown += `### Line Items:\n`;
          for (const l of docData.lines || []) {
            markdown += `- **${l.product}**: Billed **${l.billed}**, Dispatched **${l.dispatched}** (Remaining: **${l.remaining} ${l.unit}**)\n`;
          }
          actions.push({
            label: "Create Dispatch Outward",
            route: "/dispatch/new",
            params: { invoiceNumber: docData.number },
            permission: "dispatch.create",
          });
          actions.push({ label: "View Invoices", route: "/invoices", permission: "invoice.view" });
        } else {
          markdown = `## Dispatch Outward: ${docData.number}\n\n`;
          markdown += `**Customer:** ${docData.party || "Direct"} | **Godown:** \`${docData.godown}\` | **Status:** \`${docData.status}\`\n`;
          markdown += `**Invoice Ref:** ${docData.invoice || "N/A"}\n\n`;
          markdown += `### Dispatched Batches:\n`;
          for (const l of docData.lines || []) {
            markdown += `- **${l.product}**: Batch \`${l.batch}\` (Exp: ${l.expiryDate || "None"}), Qty: **${l.quantity} ${l.baseUnit}**\n`;
          }
          actions.push({ label: "View Dispatches", route: "/dispatch", permission: "dispatch.view" });
        }
        sources.push("Operational Document Registry");
        break;
      }

      case "low_stock_reorder": {
        const alertData = executed.find((e) => e.toolName === "get_low_stock_alerts")?.output as AlertResult | undefined;
        const reorderData = executed.find((e) => e.toolName === "get_reorder_recommendations")?.output as ReorderResult | undefined;
        const alerts = alertData?.alerts || [];
        const reorders = reorderData?.recommendations || [];

        markdown = `## Inventory Replenishment & Reorder Analysis\n\n`;
        markdown += `Active Stock Alerts: **${alerts.length}** | Replenishment Needed: **${reorders.length}** items\n\n`;

        if (reorders.length > 0) {
          markdown += `### Recommended Purchase Orders:\n`;
          for (const r of reorders) {
            markdown += `- ⚠️ **${r.product}** in Godown **\`${r.godown}\`**:\n`;
            markdown += `  - Current Stock: **${r.currentStock} ${r.unit}** (Below Reorder Level of **${r.reorderLevel} ${r.unit}**)\n`;
            markdown += `  - Recommended Minimum Reorder: **${r.recommendedMinimumOrder} ${r.unit}**\n`;
          }
        } else {
          markdown += `✅ All active products currently meet or exceed configured reorder safety levels.\n`;
        }

        actions.push({ label: "Create Purchase Order", route: "/purchasing/new", permission: "po.manage" });
        actions.push({ label: "Stock Alerts Overview", route: "/dashboard", permission: "dashboard.view" });
        sources.push("Automated Reorder Rule Engine & Alert Monitor");
        break;
      }

      case "godowns": {
        const gData = executed.find((e) => e.toolName === "get_godowns")?.output as GodownResult | undefined;
        const godowns = gData?.godowns || [];

        markdown = `## Active Warehouse Godowns & Storage Locations\n\n`;
        markdown += `Registered active godowns: **${godowns.length}**\n\n`;

        for (const g of godowns) {
          markdown += `- 🏬 **\`${g.code}\`** — **${g.name}**\n`;
          markdown += `  - Address: ${g.address || "Standard Facility"} | Tally Sync: ${g.tallySyncEnabled ? "Enabled" : "Disabled"}\n`;
          markdown += `  - Active Stock Lines: **${g.activeStockLines}** distinct product-batch rows on hand\n`;
        }

        actions.push({ label: "Manage Godowns", route: "/masters/godowns", permission: "master.view" });
        actions.push({ label: "View Godown Stock", route: "/stock", permission: "stock.view" });
        sources.push("Godown Master Registry");
        break;
      }

      case "stock_check": {
        const stockData = executed.find((e) => e.toolName === "check_stock")?.output as StockResult | undefined;
        if (!stockData || stockData.error) {
          markdown = `### Stock Lookup\n\n${stockData?.error || "Product not found"}.\n\nPlease try searching by SKU code (e.g. \`BASMATI-01\`) or name.`;
          actions.push({ label: "Browse Product Master", route: "/masters/skus", permission: "master.view" });
          break;
        }

        markdown = `## Live Stock Balance: ${stockData.product.name} (\`${stockData.product.code}\`)\n\n`;
        markdown += `**Total On-Hand Stock:** **${stockData.totalQuantity} ${stockData.product.baseUnit}** across ${stockData.godown}\n\n`;
        markdown += `### Batches in FEFO Order:\n`;

        if (stockData.batches && stockData.batches.length > 0) {
          for (const b of stockData.batches) {
            const expText = b.expired ? "🚨 **EXPIRED**" : b.expiryDate ? `Exp: ${b.expiryDate}` : "No Expiry";
            markdown += `- Godown **\`${b.godown}\`** | Batch **\`${b.batch}\`**: **${b.quantity} ${stockData.product.baseUnit}** (${expText})\n`;
          }
        } else {
          markdown += `_No active inventory stock currently on hand._\n`;
        }

        actions.push({ label: "Create Outward Dispatch", route: "/dispatch/new", permission: "dispatch.create" });
        actions.push({ label: "Create Purchase Order", route: "/purchasing/new", permission: "po.manage" });
        actions.push({ label: "View Ledger History", route: "/stock/ledger", permission: "ledger.view" });
        sources.push("Live Stock Balance & Cryptographic Ledger");
        break;
      }

      default: {
        const counts = await getWorkspaceCounts();
        const knowledge = answerFromKnowledge(message, { ...context }, counts);
        markdown = knowledge.answer;
        actions.push(...knowledge.actions);
        sources.push(...knowledge.sources);
        break;
      }
    }

    // Filter actions by role permission
    const allowed = actions.filter((act) => !act.permission || can(context.role, act.permission));

    return {
      stepsExecuted: executed,
      markdownAnswer: markdown,
      actions: allowed,
      sources,
    };
  }

  /**
   * Streams the multi-step agent execution progress and final answer as SSE events.
   */
  static executeAutonomousAgentStream(
    message: string,
    context: AgentContext,
  ): ReadableStream<Uint8Array> {
    return new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          const { steps } = AutonomousAgentService.planIntent(message, context);

          // If multi-step operational task, send a brief status indicator
          if (steps.length > 1) {
            controller.enqueue(
              sseEvent({
                delta: `⚡ _Autonomous Agent: Formulated ${steps.length}-step plan across ${steps.map((s) => s.name).join(" ➔ ")}_\n\n`,
              }),
            );
            await new Promise((r) => setTimeout(r, 60));
          }

          const result = await AutonomousAgentService.executePlan(message, context);

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
