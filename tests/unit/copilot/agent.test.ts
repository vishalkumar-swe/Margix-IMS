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
});
