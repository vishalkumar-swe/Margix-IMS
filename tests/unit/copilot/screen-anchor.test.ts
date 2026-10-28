import { describe, expect, it } from "vitest";
import {
  anchorLookup,
  deriveAnchorFromRoute,
  describeAnchor,
  isAnchorReference,
} from "@/lib/copilot/screen-anchor";

describe("deriveAnchorFromRoute", () => {
  it("anchors a supplier detail screen", () => {
    expect(deriveAnchorFromRoute("/masters/suppliers/sup-123")).toEqual({
      kind: "supplier",
      id: "sup-123",
      source: "route",
    });
  });

  it("anchors nested detail routes past the action segment", () => {
    expect(deriveAnchorFromRoute("/purchase-orders/po-9/edit")).toMatchObject({
      kind: "purchaseOrder",
      id: "po-9",
    });
  });

  it("ignores the query string", () => {
    expect(deriveAnchorFromRoute("/invoices/inv-1?tour=billing")).toMatchObject({ kind: "invoice", id: "inv-1" });
  });

  it("does not anchor list screens or create forms", () => {
    expect(deriveAnchorFromRoute("/masters/suppliers")).toBeNull();
    expect(deriveAnchorFromRoute("/purchase-orders/new")).toBeNull();
    expect(deriveAnchorFromRoute("/masters/skus/labels")).toBeNull();
    expect(deriveAnchorFromRoute("/dashboard")).toBeNull();
  });

  it("keeps the longest matching prefix so SKUs are not read as generic masters", () => {
    expect(deriveAnchorFromRoute("/masters/skus/sku-7")).toMatchObject({ kind: "sku", id: "sku-7" });
    expect(deriveAnchorFromRoute("/stock/sku-7")).toMatchObject({ kind: "sku", id: "sku-7" });
  });
});

describe("isAnchorReference", () => {
  it("detects English pronouns and demonstratives", () => {
    expect(isAnchorReference("delete it")).toBe(true);
    expect(isAnchorReference("show its batches")).toBe(true);
    expect(isAnchorReference("dispatch this")).toBe(true);
  });

  it("detects Hindi and Hinglish references", () => {
    expect(isAnchorReference("ise hata do")).toBe(true);
    expect(isAnchorReference("iska detail batao")).toBe(true);
  });

  it("stays quiet when the record is named", () => {
    expect(isAnchorReference("deactivate supplier Agrawal Traders")).toBe(false);
    expect(isAnchorReference("list all suppliers")).toBe(false);
  });
});

describe("anchorLookup", () => {
  it("maps an anchored record to its detail tool", () => {
    expect(anchorLookup({ kind: "invoice", id: "inv-1", source: "route" })).toEqual({
      toolName: "get_invoice_detail",
      identifier: "inv-1",
      noun: "invoice",
    });
  });

  it("falls back to the visible label when no id was captured", () => {
    expect(anchorLookup({ kind: "supplier", label: "Agrawal Traders", source: "selection" })).toMatchObject({
      identifier: "Agrawal Traders",
    });
  });

  it("returns null for kinds without a detail tool and for empty anchors", () => {
    expect(anchorLookup({ kind: "user", id: "u-1", source: "route" })).toBeNull();
    expect(anchorLookup(null)).toBeNull();
  });
});

describe("describeAnchor", () => {
  it("names the record for the model", () => {
    const line = describeAnchor({ kind: "purchaseOrder", id: "po-1", label: "PO-2026-0001", source: "selection" });
    expect(line).toContain("purchase order");
    expect(line).toContain("PO-2026-0001");
    expect(line).toContain("po-1");
  });

  it("returns null when nothing is anchored", () => {
    expect(describeAnchor(null)).toBeNull();
  });
});
