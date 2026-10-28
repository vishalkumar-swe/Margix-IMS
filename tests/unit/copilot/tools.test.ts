import { describe, expect, it } from "vitest";
import type { RoleCode } from "@prisma/client";
import {
  copilotToolsForRole,
  executeCopilotTool,
  executeCopilotToolData,
  serializeToolResult,
} from "@/server/modules/copilot/tools";

const context = { role: "ADMIN" as RoleCode, route: "/dashboard" };

describe("Copilot tools", () => {
  it("exposes the read-only operational tools and no write tools", () => {
    const names = copilotToolsForRole("ADMIN").map((tool) => tool.function.name);
    expect(names).toEqual(
      expect.arrayContaining([
        "get_workspace_summary",
        "search_products",
        "check_stock",
        "list_documents",
        "get_document_status",
        "get_fefo_pick_list",
        "check_expiring_batches",
        "get_godowns",
        "get_recent_ledger_movements",
        "check_dispatch_readiness",
        "get_reorder_recommendations",
      ]),
    );
    expect(names.some((name) => /^(create|update|delete|post|cancel|reverse)_/.test(name))).toBe(false);
  });

  it("keeps oversized tool results valid JSON", () => {
    const serialized = serializeToolResult({ rows: "x".repeat(7000) });
    const parsed = JSON.parse(serialized) as { truncated: boolean; note: string; preview: string };
    expect(parsed.truncated).toBe(true);
    expect(parsed.preview.length).toBeLessThanOrEqual(6000);
  });

  it("returns an error object for an unknown tool", async () => {
    const result = (await executeCopilotToolData("drop_everything", "{}", context)) as { error: string };
    expect(result.error).toContain("Unknown tool");
  });

  it("rejects malformed arguments without touching the database", async () => {
    const result = JSON.parse(await executeCopilotTool("search_products", "{not json", context)) as {
      error: string;
    };
    expect(result.error).toContain("valid JSON");
  });

  it("validates required arguments before querying", async () => {
    const result = JSON.parse(
      await executeCopilotTool("search_products", JSON.stringify({ query: "" }), context),
    ) as { error: string };
    expect(result.error).toContain("query");
  });

  it("enforces the tool permission before execution", async () => {
    const result = (await executeCopilotToolData("get_workspace_summary", "{}", {
      role: "UNKNOWN" as RoleCode,
      route: "/dashboard",
    })) as { error: string };
    expect(result.error).toContain("role cannot access");
  });

  it("filters tools dynamically based on query intent to minimize latency and token load", () => {
    // Market / stock query
    const marketTools = copilotToolsForRole("ADMIN", "stock price of jio platform and plot chart for last 100 LTP").map(
      (t) => t.function.name,
    );
    expect(marketTools).toContain("get_market_quote");
    expect(marketTools.length).toBeLessThanOrEqual(10);

    // Purchasing / PO query
    const poTools = copilotToolsForRole("ADMIN", "please create a purchase order of sugar for 100 bag").map(
      (t) => t.function.name,
    );
    expect(poTools).toContain("list_purchase_orders");
    expect(poTools).toContain("list_suppliers");
    expect(poTools).toContain("propose_action");
    expect(poTools.length).toBeLessThanOrEqual(25);

    // Sales analytics query
    const salesTools = copilotToolsForRole("ADMIN", "can you analyze my sales").map((t) => t.function.name);
    expect(salesTools).toContain("get_sales_analytics");
    expect(salesTools).toContain("list_invoices");
    expect(salesTools.length).toBeLessThanOrEqual(18);
  });

  it("executes propose_action and invokes onProposeConfirmation callback", async () => {
    let capturedConfirmation: unknown;
    const result = (await executeCopilotToolData(
      "propose_action",
      JSON.stringify({
        actionType: "CREATE_PO",
        title: "Create Purchase Order: Sugar 100 Bags",
        description: "Open purchase order for Sugar",
        payload: { skuName: "Sugar", quantity: 100 },
      }),
      {
        ...context,
        onProposeConfirmation: (c) => {
          capturedConfirmation = c;
        },
      },
    )) as { success: boolean; confirmationId: string; message: string };

    expect(result.success).toBe(true);
    expect(capturedConfirmation).toBeDefined();
    expect((capturedConfirmation as { actionType: string }).actionType).toBe("CREATE_PO");
  });

  it("executes propose_purchase_order and creates structured PO proposal", async () => {
    let capturedConfirmation: unknown;
    const result = (await executeCopilotToolData(
      "propose_purchase_order",
      JSON.stringify({
        supplierName: "Balaji Agro Mills",
        godownName: "Central Warehouse",
        items: [{ productName: "Refined Sugar", quantity: 100, rate: 3800 }],
      }),
      {
        ...context,
        onProposeConfirmation: (c) => {
          capturedConfirmation = c;
        },
      },
    )) as { success: boolean; confirmationId: string; message: string };

    expect(result.success).toBe(true);
    expect(capturedConfirmation).toBeDefined();
    expect((capturedConfirmation as { actionType: string }).actionType).toBe("CREATE_PO");
    expect(result.message).toContain("Purchase Order proposal created");
  });

  it("executes propose_customer and creates customer registration proposal", async () => {
    let capturedConfirmation: unknown;
    const result = (await executeCopilotToolData(
      "propose_customer",
      JSON.stringify({
        name: "Shree Krishna Traders",
        gstin: "07AAAAA1111A1Z5",
        phone: "9876543210",
      }),
      {
        ...context,
        onProposeConfirmation: (c) => {
          capturedConfirmation = c;
        },
      },
    )) as { success: boolean; confirmationId: string; message: string };

    expect(result.success).toBe(true);
    expect(capturedConfirmation).toBeDefined();
    expect((capturedConfirmation as { actionType: string }).actionType).toBe("CREATE_CUSTOMER");
  });
});
