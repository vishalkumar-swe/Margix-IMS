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
        "what all the stocks are present",
        "what all stocks are present",
        "what stocks are present",
        "what stock is present",
        "what all items are present",
        "show all stocks",
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

      const plan2 = AutonomousAgentService.planIntent("what all basmati stocks are present", context);
      expect(plan2.intent).toBe("stock_check");
      expect(plan2.steps[1].arguments).toMatchObject({ product: "basmati" });
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

    it("handles web research inquiries, order creation guidance, and HSN inquiries accurately", () => {
      // 1. Web research & capability inquiry
      const capPlan = AutonomousAgentService.planIntent("can you do a web research?", context);
      expect(capPlan.intent).toBe("copilot_capabilities");
      expect(AutonomousAgentService.isOperationalOrConfirmation("can you do a web research?")).toBe(true);

      // 2. Order creation capability inquiry
      const orderPlan = AutonomousAgentService.planIntent("will you able to create a order?", context);
      expect(orderPlan.intent).toBe("order_creation_guidance");
      expect(AutonomousAgentService.isOperationalOrConfirmation("will you able to create a order?")).toBe(true);

      // 3. HSN capability from web inquiry
      const hsnWebPlan = AutonomousAgentService.planIntent("will you able to find out the hsn, other details of product from the web", context);
      expect(hsnWebPlan.intent).toBe("hsn_guidance");
      expect(AutonomousAgentService.isOperationalOrConfirmation("will you able to find out the hsn, other details of product from the web")).toBe(true);

      // 4. Specific product HSN search
      const hsnSearchPlan = AutonomousAgentService.planIntent("what is the hsn for basmati rice", context);
      expect(hsnSearchPlan.intent).toBe("list_hsn_codes");
      expect(hsnSearchPlan.steps[0].arguments).toMatchObject({ query: "basmati rice" });

      // 5. Full HSN directory listing
      const hsnAllPlan = AutonomousAgentService.planIntent("show all hsn codes", context);
      expect(hsnAllPlan.intent).toBe("list_hsn_codes");
      expect(hsnAllPlan.steps[0].arguments).not.toHaveProperty("query");
    });

    it("plans product registration progressive slot-filling and consultative questions", () => {
      const addQueries = [
        "add a product",
        "add a rice",
        "add rice",
        "chawal add karo",
        "create a product",
        "register item",
        "add sugar",
      ];
      for (const q of addQueries) {
        const plan = AutonomousAgentService.planIntent(q, context);
        expect(plan.intent).toBe("propose_add_product");
        expect(AutonomousAgentService.isOperationalOrConfirmation(q)).toBe(true);
      }

      // Check commodity-specific step for rice
      const ricePlan = AutonomousAgentService.planIntent("add a rice", context);
      expect(ricePlan.steps.some((s) => s.toolName === "list_hsn_codes")).toBe(true);
      expect(ricePlan.steps.find((s) => s.toolName === "list_hsn_codes")?.arguments).toMatchObject({ query: "rice" });
    });

    it("plans actionable deep web research when user requests internet search", () => {
      const queries = [
        "search the web for basmati rice prices in mandi",
        "do web search to get the prices of basmati rice across india",
        "web search for basmati rice prices",
      ];
      for (const q of queries) {
        const researchPlan = AutonomousAgentService.planIntent(q, context);
        expect(researchPlan.intent).toBe("execute_web_research");
        expect(researchPlan.steps[0].toolName).toBe("web_research");
        expect(AutonomousAgentService.isOperationalOrConfirmation(q)).toBe(true);
      }

      // Capability inquiry without target query
      const capPlan = AutonomousAgentService.planIntent("can you do a websearch?", context);
      expect(capPlan.intent).toBe("copilot_capabilities");
      expect(AutonomousAgentService.isOperationalOrConfirmation("can you do a websearch?")).toBe(true);
    });

    it("plans and executes commercial buy/sell deep research with market rates and 1-click actions", async () => {
      const tradeQueries = [
        "what is the market price of basmati 1121 and should we buy or sell?",
        "should we buy or sell basmati rice?",
        "should i buy or sell wheat today?",
        "what are the mandi rates for mustard oil?",
        "check market rates for sugar 50kg bag to buy or sell",
      ];

      for (const q of tradeQueries) {
        const plan = AutonomousAgentService.planIntent(q, context);
        expect(plan.intent).toBe("execute_web_research");
        expect(plan.steps[0].toolName).toBe("web_research");
        expect(AutonomousAgentService.isOperationalOrConfirmation(q)).toBe(true);
      }

      // Execute full plan for Basmati 1121 buy/sell advice
      const result = await AutonomousAgentService.executePlan(
        "what is the market price of basmati 1121 and should we buy or sell?",
        context,
      );

      expect(result.markdownAnswer).toContain("Market Price Discovery & Trade Recommendation");
      expect(result.markdownAnswer).toContain("APMC Mandi Rates & Price Discovery");
      expect(result.markdownAnswer).toContain("Procurement Strategy (BUY Decision)");
      expect(result.markdownAnswer).toContain("Invoicing & Sales Strategy (SELL Decision)");
      expect(result.markdownAnswer).toContain("HSN Classification");
      expect(result.markdownAnswer).toContain("1006 30");

      // Verify 1-click trade action buttons
      expect(result.actions.some((a) => a.label.includes("Buy: New Purchase Order"))).toBe(true);
      expect(result.actions.some((a) => a.label.includes("Sell: New Sales Invoice"))).toBe(true);
      expect(result.actions.some((a) => a.label.includes("Register Master SKU"))).toBe(true);
      expect(result.actions.some((a) => a.label.includes("Browse HSN Directory"))).toBe(true);
    });

    it("consults on missing slots for 'add a rice' with realistic business questions and chips", async () => {
      const result = await AutonomousAgentService.executePlan("add a rice", context);
      expect(result.markdownAnswer).toContain("Product Variety & Exact Trade Name");
      expect(result.markdownAnswer).toContain("Base Unit of Measure (UOM)");
      expect(result.markdownAnswer).toContain("HSN Code 100630");
      expect(result.markdownAnswer).toContain("Commercial Workflow Purpose");
      expect(result.actions.some((a) => a.label.includes("Basmati Rice 1121"))).toBe(true);
      expect(result.actions.some((a) => a.label.includes("Base Unit: KG"))).toBe(true);
      expect(result.actions.some((a) => a.label.includes("HSN 100630"))).toBe(true);
      expect(result.actions.some((a) => a.label.includes("New Purchase Order"))).toBe(true);
      expect(result.actions.some((a) => a.label.includes("New Sales Invoice"))).toBe(true);
    });

    it("generates CREATE_SKU confirmation card when specifications are supplied", async () => {
      const result = await AutonomousAgentService.executePlan(
        "add Basmati Rice 1121, unit KG, HSN 100630, 5% GST",
        context,
      );
      expect(result.confirmation).toBeDefined();
      expect(result.confirmation?.actionType).toBe("CREATE_SKU");
      expect(result.confirmation?.payload).toMatchObject({
        name: "Basmati Rice 1121",
        baseUomCode: "KG",
        hsnCode: "100630",
        gstRate: "5",
        isBatchTracked: true,
      });
      expect(result.markdownAnswer).toContain("Ready to Register Product");
      expect(result.markdownAnswer).toContain("Basmati Rice 1121");
    });

    it("plans and executes multi-stage deep research for state-wise basmati rice prices across India", async () => {
      const prompt =
        "Do web search to get the prices of basmati rice across india and prepare a list of all the state and put their avg price of basmati rice on that";

      const plan = AutonomousAgentService.planIntent(prompt, context);
      expect(plan.intent).toBe("execute_web_research");
      // Multi-stage verification: 3 targeted web_research stages + 1 catalog cross-reference
      expect(plan.steps.length).toBe(4);
      expect(plan.steps[0].name).toContain("National Mandi Benchmark");
      expect(plan.steps[1].name).toContain("Origin Producing Mandis");
      expect(plan.steps[2].name).toContain("Consumption & Terminal Hubs");
      expect(plan.steps[3].toolName).toBe("search_products");

      const result = await AutonomousAgentService.executePlan(prompt, context);

      // Verify header and dynamic date
      expect(result.markdownAnswer).toContain("State-Wise Mandi Price Intelligence");
      expect(result.markdownAnswer).toContain("Research Date & Timestamp");
      expect(result.markdownAnswer).toContain("2026");

      // Verify states are present with both Qtl and Kg rates
      expect(result.markdownAnswer).toContain("Punjab");
      expect(result.markdownAnswer).toContain("Haryana");
      expect(result.markdownAnswer).toContain("Uttar Pradesh");
      expect(result.markdownAnswer).toContain("Rajasthan");
      expect(result.markdownAnswer).toContain("Madhya Pradesh");
      expect(result.markdownAnswer).toContain("Delhi NCR");
      expect(result.markdownAnswer).toContain("Maharashtra");
      expect(result.markdownAnswer).toContain("West Bengal");
      expect(result.markdownAnswer).toContain("Karnataka");

      expect(result.markdownAnswer).toContain("/ Qtl");
      expect(result.markdownAnswer).toContain("/ KG");

      // Verify BUY and SELL strategic decisions
      expect(result.markdownAnswer).toContain("Procurement Strategy (BUY Decision)");
      expect(result.markdownAnswer).toContain("Invoicing & Sales Strategy (SELL Decision)");

      // Verify 1-click action buttons
      expect(result.actions.some((a) => a.label.includes("Buy: New Purchase Order"))).toBe(true);
      expect(result.actions.some((a) => a.label.includes("Sell: New Sales Invoice"))).toBe(true);
      expect(result.actions.some((a) => a.label.includes("Register Master SKU"))).toBe(true);
      expect(result.actions.some((a) => a.label.includes("Browse HSN Directory"))).toBe(true);
    });

    it("inherits commodity from conversation history for conversational state-wise inquiries", async () => {
      const history = [
        { role: "user" as const, content: "Do web search to get the prices of basmati rice across india" },
        { role: "assistant" as const, content: "Here are the live prices of basmati rice across mandis." },
      ];
      const followUpPrompt = "can you create me a list of all the state of india and the avg price, high price, low price of each state?";

      const plan = AutonomousAgentService.planIntent(followUpPrompt, context, history);
      expect(plan.intent).toBe("execute_web_research");
      expect(plan.steps.length).toBe(4);
      // Ensure commodity is cleanly extracted as "basmati rice" and not sentence garbage
      expect(plan.steps[0].arguments.query).toContain("basmati rice");
      expect(plan.steps[0].arguments.query).not.toContain("create me a list");

      const progressCalls: Array<{ index: number; status: string; summary?: string }> = [];
      const result = await AutonomousAgentService.executePlan(
        followUpPrompt,
        context,
        undefined,
        history,
        undefined,
        (index, _step, status, summary) => {
          progressCalls.push({ index, status, summary });
        },
      );

      // Verify progress callback was triggered
      expect(progressCalls.length).toBeGreaterThanOrEqual(4);
      expect(progressCalls.some((p) => p.status === "running")).toBe(true);
      expect(progressCalls.some((p) => p.status === "completed")).toBe(true);

      // Verify response content
      expect(result.markdownAnswer).toContain("State-Wise Mandi Price Intelligence");
      expect(result.markdownAnswer).toContain("Punjab");
      expect(result.markdownAnswer).toContain("Haryana");
    });

    it("defaults to national APMC benchmark commodity when no history exists for state-wise query", () => {
      const prompt = "can you create me a list of all the state of india and the avg price, high price, low price of each state?";
      const plan = AutonomousAgentService.planIntent(prompt, context);
      expect(plan.intent).toBe("execute_web_research");
      expect(plan.steps.length).toBe(4);
      expect(plan.steps[0].arguments.query).toContain("basmati rice");
      expect(plan.steps[0].arguments.query).not.toContain("create me a list");
    });

    it("plans and executes visual architecture graph when requested", async () => {
      const prompt = "please can you creaet a graph representation";
      const plan = AutonomousAgentService.planIntent(prompt, context);
      expect(plan.intent).toBe("system_architecture_graph");
      expect(plan.steps).toHaveLength(1);
      expect(plan.steps[0].toolName).toBe("get_workspace_summary");

      const result = await AutonomousAgentService.executePlan(prompt, context);
      expect(result.markdownAnswer).toContain("Margix IMS Architectural Ledger & Flowchart");
      expect(result.markdownAnswer).toContain("IMMUTABLE STOCK LEDGER");
      expect(result.markdownAnswer).toContain("Core Cryptographic Rule");
      expect(result.actions.some((a) => a.route === "/ledger")).toBe(true);
      expect(result.actions.some((a) => a.route === "/stock")).toBe(true);
    });

    it("plans and executes rice price across India with visual chart preparation", async () => {
      const prompt = "get rice price across india and prepare chart for that";
      const plan = AutonomousAgentService.planIntent(prompt, context);
      expect(plan.intent).toBe("execute_web_research");
      expect(plan.steps.length).toBe(4);
      expect(plan.steps[0].arguments.query).toContain("rice");

      const result = await AutonomousAgentService.executePlan(prompt, context);
      expect(result.markdownAnswer).toContain("State-Wise Mandi Price Intelligence");
      expect(result.markdownAnswer).toContain("chart:bar");
      expect(result.markdownAnswer).toContain("Plain Language Summary");
      expect(result.markdownAnswer).toContain("Punjab");
      expect(result.markdownAnswer).toContain("Haryana");
    });
  });
});


