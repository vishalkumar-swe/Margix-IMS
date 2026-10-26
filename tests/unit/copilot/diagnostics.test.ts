import { describe, expect, it } from "vitest";
import { diagnoseError } from "@/lib/copilot/diagnostics";

describe("error diagnosis", () => {
  it("explains insufficient stock with the blocked quantity and a FEFO fix", () => {
    const result = diagnoseError("INSUFFICIENT_STOCK", "blocked", {
      sku: "Royal Basmati Rice",
      batch: "BATCH-2026-A",
      available: "4",
      requested: "10",
    });
    expect(result.explanation).toContain("BATCH-2026-A");
    expect(result.explanation).toContain("Royal Basmati Rice");
    expect(result.explanation).toContain("4 available");
    expect(result.explanation).toContain("10");
    expect(result.actions[0]).toMatchObject({
      route: "/dispatches/new",
      highlightSelector: '[data-tour="fefo-auto-pick-btn"]',
      permission: "dispatch.create",
    });
  });

  it("keeps the generic explanation when stock details are absent", () => {
    const result = diagnoseError("INSUFFICIENT_STOCK", "blocked", null);
    expect(result.explanation).toContain("does not have enough stock");
    expect(result.actions).toHaveLength(2);
  });

  it("deep-links over-receipt to the purchase order receiver", () => {
    const result = diagnoseError("OVER_RECEIPT", "blocked", {});
    expect(result.actions[0].route).toBe("/purchase-orders/{latestOpenPurchaseOrderId}");
    expect(result.actions[0].highlightSelector).toBe('[data-tour="grn-accepted"]');
  });

  it("deep-links over-dispatch to the invoice remaining quantities", () => {
    const result = diagnoseError("OVER_DISPATCH", "blocked", {});
    expect(result.actions[0].route).toBe("/invoices/{latestOpenInvoiceId}");
  });

  it("distinguishes a maker-checker violation from a plain permission denial", () => {
    expect(diagnoseError("MAKER_CHECKER_VIOLATION", "", null).title).toBe("A second person must approve this");
    expect(diagnoseError("FORBIDDEN", "", null).title).toBe("Your role cannot perform this action");
    expect(diagnoseError("FORBIDDEN", "", null).actions[0].route).toBe("/adjustments?status=SUBMITTED");
  });

  it("surfaces the server validation message", () => {
    const result = diagnoseError("VALIDATION_ERROR", "HSN code is required", null);
    expect(result.explanation).toBe("HSN code is required");
    expect(result.actions).toEqual([]);
  });

  it("explains a reversed ledger entry", () => {
    expect(diagnoseError("ALREADY_REVERSED", "", null).explanation).toContain("at most once");
    expect(diagnoseError("CANNOT_REVERSE", "", null).actions[0].route).toBe("/ledger");
  });

  it("falls back to a Copilot hand-off for an unknown code", () => {
    const result = diagnoseError("SOMETHING_NEW", "The server rejected the request.", null);
    expect(result.title).toBe("That action was blocked");
    expect(result.explanation).toBe("The server rejected the request.");
    expect(result.actions[0].label).toBe("Ask the Copilot");
  });
});
