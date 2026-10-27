import { describe, expect, it } from "vitest";
import { AutonomousAgentService } from "@/server/modules/copilot/agent.service";

describe("AutonomousAgentService", () => {
  const context = { role: "ADMIN" as const, route: "/dashboard" };

  it("plans FEFO batch allocation when asked for pick list", () => {
    const plan = AutonomousAgentService.planIntent("give me a fefo pick list for 50 bags of Basmati Rice", context);
    expect(plan.intent).toBe("fefo_allocation");
    expect(plan.steps).toHaveLength(2);
    expect(plan.steps[0].toolName).toBe("search_products");
    expect(plan.steps[1].toolName).toBe("get_fefo_pick_list");
    expect(plan.steps[1].arguments).toHaveProperty("quantity", 50);
  });

  it("plans dispatch readiness check when an invoice number is mentioned", () => {
    const plan = AutonomousAgentService.planIntent("can we dispatch invoice INV-2026-0001 right now?", context);
    expect(plan.intent).toBe("dispatch_readiness");
    expect(plan.steps[0].toolName).toBe("check_dispatch_readiness");
    expect(plan.steps[0].arguments).toHaveProperty("invoiceNumber", "INV-2026-0001");
  });

  it("plans expiring batches scan when asking about shelf-life or expiry", () => {
    const plan = AutonomousAgentService.planIntent("show me batches expiring in the next 30 days", context);
    expect(plan.intent).toBe("expiring_batches");
    expect(plan.steps[0].toolName).toBe("check_expiring_batches");
    expect(plan.steps[0].arguments).toHaveProperty("days", 30);
  });

  it("plans ledger audit movement query when asking for ledger entries", () => {
    const plan = AutonomousAgentService.planIntent("show me recent ledger movements for PO-2026-0001", context);
    expect(plan.intent).toBe("ledger_audit");
    expect(plan.steps[0].toolName).toBe("get_recent_ledger_movements");
    expect(plan.steps[0].arguments).toHaveProperty("referenceNo", "PO-2026-0001");
  });

  it("plans low stock replenishment analysis when asking about reorder", () => {
    const plan = AutonomousAgentService.planIntent("what products are at low stock and need reorder?", context);
    expect(plan.intent).toBe("low_stock_reorder");
    expect(plan.steps).toHaveLength(2);
    expect(plan.steps[0].toolName).toBe("get_low_stock_alerts");
    expect(plan.steps[1].toolName).toBe("get_reorder_recommendations");
  });

  it("plans stock lookup for a specific product", () => {
    const plan = AutonomousAgentService.planIntent("check stock balance of Basmati Rice", context);
    expect(plan.intent).toBe("stock_check");
    expect(plan.steps[1].toolName).toBe("check_stock");
  });

  it("does not invent an invoice number when the user did not provide one", () => {
    const plan = AutonomousAgentService.planIntent("can we dispatch right now?", context);
    expect(plan.intent).toBe("dispatch_readiness");
    expect(plan.steps).toHaveLength(0);
  });

  it("sends conceptual stock questions to the knowledge base", () => {
    const plan = AutonomousAgentService.planIntent("how does stock work?", context);
    expect(plan.intent).toBe("general_operational");
    expect(plan.steps[0].toolName).toBe("get_workspace_summary");
  });

  it("keeps a product code intact in a FEFO request", () => {
    const plan = AutonomousAgentService.planIntent("fefo pick list for BASMATI-01", context);
    expect(plan.intent).toBe("fefo_allocation");
    expect(plan.steps[1].arguments).toMatchObject({ product: "BASMATI-01", quantity: 10 });
  });

  it("does not mangle a product name or trailing punctuation", () => {
    const plan = AutonomousAgentService.planIntent("show me stock of Coffee?", context);
    expect(plan.intent).toBe("stock_check");
    expect(plan.steps[1].arguments).toMatchObject({ product: "Coffee" });
  });

  it("checks invoice status without treating it as a dispatch request", () => {
    const plan = AutonomousAgentService.planIntent("what is the status of invoice INV-2026-0001?", context);
    expect(plan.intent).toBe("document_status");
    expect(plan.steps[0].arguments).toMatchObject({ type: "invoice", number: "INV-2026-0001" });
  });

  it("does not invent a purchase order number", () => {
    const plan = AutonomousAgentService.planIntent("show me my purchase order", context);
    expect(plan.intent).toBe("document_status");
    expect(plan.steps).toHaveLength(0);
  });

  describe("Conversational, Broken English & Hinglish Multi-leg Intents", () => {
    it("recognizes broken English / Hinglish for invoice cancellation proposal", () => {
      const plan1 = AutonomousAgentService.planIntent("bhai inv-001 cancel kar do", context);
      expect(plan1.intent).toBe("propose_cancel_invoice");

      const plan2 = AutonomousAgentService.planIntent("please invoice cancle kardo", context);
      expect(plan2.intent).toBe("propose_cancel_invoice");
    });

    it("recognizes PO short-close conversational phrasing", () => {
      const plan = AutonomousAgentService.planIntent("short close PO-2026-0001 please", context);
      expect(plan.intent).toBe("propose_short_close_po");

      const planHinglish = AutonomousAgentService.planIntent("po close kardo baki ka", context);
      expect(planHinglish.intent).toBe("propose_short_close_po");
    });

    it("recognizes ledger movement reversal phrasing", () => {
      const plan = AutonomousAgentService.planIntent("reverse wrong entry in ledger LE-001", context);
      expect(plan.intent).toBe("propose_reverse_ledger");

      const planHinglish = AutonomousAgentService.planIntent("galat entry wapas lo ledger me", context);
      expect(planHinglish.intent).toBe("propose_reverse_ledger");
    });

    it("recognizes sandbox seed and purge conversational commands", () => {
      const seedPlan = AutonomousAgentService.planIntent("demo data seed karo", context);
      expect(seedPlan.intent).toBe("execute_seed_sandbox");

      const purgePlan = AutonomousAgentService.planIntent("demo sandbox saaf kardo", context);
      expect(purgePlan.intent).toBe("propose_purge_sandbox");
    });

    it("recognizes dispatch posting proposal from conversational request", () => {
      const plan = AutonomousAgentService.planIntent("fefo se dispatch bna do for invoice INV-2026-0001", context);
      expect(plan.intent).toBe("propose_post_dispatch");
    });
  });

  describe("Human-in-the-Loop Confirmation Protocol", () => {
    const pendingConfirmation = {
      id: "conf-123",
      actionType: "CANCEL_INVOICE" as const,
      title: "Cancel Invoice",
      description: "Cancel test invoice",
      destructive: true,
      requiredPermission: "invoice.manage",
      payload: { invoiceId: "inv-1", invoiceNumber: "INV-100" },
      status: "pending" as const,
    };

    const historyWithPending = [
      { role: "user" as const, content: "cancel invoice INV-100" },
      {
        role: "assistant" as const,
        content: "Please confirm cancellation",
        confirmation: pendingConfirmation,
      },
    ];

    it("resolves affirmative confirmation replies (yes, ha, kardo, proceed)", () => {
      const affirmativePhrases = ["yes", "ha kardo", "proceed karo", "confirm it", "sure", "theek hai"];
      for (const phrase of affirmativePhrases) {
        const plan = AutonomousAgentService.planIntent(phrase, context, historyWithPending);
        expect(plan.intent).toBe("execute_pending_confirmation");
        expect(plan.pendingConfirmation?.id).toBe("conf-123");
      }
    });

    it("resolves negative cancellation replies (no, nahi, abort, cancel)", () => {
      const negativePhrases = ["no", "nahi", "abort", "cancel it", "mat karo", "chhod do"];
      for (const phrase of negativePhrases) {
        const plan = AutonomousAgentService.planIntent(phrase, context, historyWithPending);
        expect(plan.intent).toBe("cancel_pending_confirmation");
        expect(plan.pendingConfirmation?.id).toBe("conf-123");
      }
    });

    it("isOperationalOrConfirmation detects operational intent and pending confirmations", () => {
      expect(AutonomousAgentService.isOperationalOrConfirmation("bhai inv-001 cancel kar do")).toBe(true);
      expect(AutonomousAgentService.isOperationalOrConfirmation("ha kardo", historyWithPending)).toBe(true);
      expect(AutonomousAgentService.isOperationalOrConfirmation("nahi", historyWithPending)).toBe(true);
      expect(AutonomousAgentService.isOperationalOrConfirmation("what is the GST rate on basmati rice?")).toBe(false);
    });

    it("executes confirmation cancellation safely without mutating records", async () => {
      const actor = { userId: "user-1", role: "ADMIN" as const };
      const result = await AutonomousAgentService.executeConfirmation(actor, {
        confirmationId: "conf-123",
        actionType: "CANCEL_INVOICE",
        payload: { invoiceId: "inv-1" },
        decision: "cancel",
      });

      expect(result.success).toBe(true);
      expect(result.data.status).toBe("cancelled");
      expect(result.data.message).toContain("cancelled");
    });
  });

  describe("Conversational Greetings, Hindi/Hinglish & Inventory Overview Queries", () => {
    it("recognizes greetings naturally without mangling them into product lookups", () => {
      const greetingQueries = ["hi", "hello", "hey", "namaste", "good morning", "kaise ho"];
      for (const query of greetingQueries) {
        const plan = AutonomousAgentService.planIntent(query, context);
        expect(plan.intent).toBe("greeting");
        expect(plan.steps[0].toolName).toBe("get_workspace_summary");
      }
    });

    it("recognizes requests to chat in Hindi or language difficulty", () => {
      const hindiQueries = [
        "you can chat in hindi",
        "i don't undersand english",
        "hindi me baat karo",
        "what are you giving i don't underatnd",
        "samajh nahi aaya",
      ];
      for (const query of hindiQueries) {
        const plan = AutonomousAgentService.planIntent(query, context);
        expect(plan.intent).toBe("hindi_conversation");
        expect(plan.steps[0].toolName).toBe("get_workspace_summary");
      }
    });

    it("recognizes general inventory availability queries without treating the whole question as a product name", () => {
      const inventoryQueries = [
        "ok is there any product availabe on my inventory",
        "is there any product available",
        "kya stock hai",
        "show inventory",
        "what products do we have",
        "all stock",
      ];
      for (const query of inventoryQueries) {
        const plan = AutonomousAgentService.planIntent(query, context);
        expect(plan.intent).toBe("inventory_overview");
        expect(plan.steps[0].toolName).toBe("get_inventory_overview");
      }
    });

    it("still targets a specific product when a real product name is provided", () => {
      const plan = AutonomousAgentService.planIntent("check stock balance of Basmati Rice", context);
      expect(plan.intent).toBe("stock_check");
      expect(plan.steps[1].arguments).toMatchObject({ product: "Basmati Rice" });
    });

    it("plans end-to-end enterprise tools across all operational domains", () => {
      expect(AutonomousAgentService.planIntent("show my daily checklist", context).intent).toBe("daily_checklist");
      expect(AutonomousAgentService.planIntent("show business analytics and revenue kpi", context).intent).toBe("analytics_overview");
      expect(AutonomousAgentService.planIntent("check dead stock and slow moving items", context).intent).toBe("idle_stock");
      expect(AutonomousAgentService.planIntent("give me stock movement summary report", context).intent).toBe("stock_summary_report");
      expect(AutonomousAgentService.planIntent("show open purchase orders", context).intent).toBe("list_purchase_orders");
      expect(AutonomousAgentService.planIntent("list recent goods receipt notes", context).intent).toBe("list_grns");
      expect(AutonomousAgentService.planIntent("show pending invoices", context).intent).toBe("list_invoices");
      expect(AutonomousAgentService.planIntent("show recent dispatches and delivery challans", context).intent).toBe("list_dispatches");
      expect(AutonomousAgentService.planIntent("show all product batches", context).intent).toBe("list_batches");
      expect(AutonomousAgentService.planIntent("check my notifications and unread alerts", context).intent).toBe("my_notifications");
      expect(AutonomousAgentService.planIntent("can we reverse GRN-2026-0001 safely?", context).intent).toBe("reversal_check");
    });
  });
});

