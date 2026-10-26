import type { RoleCode } from "@prisma/client";
import { describe, expect, it } from "vitest";
import {
  fallbackHref,
  intentHref,
  matchesPath,
  milestoneAccess,
  nextMilestone,
  progressForRole,
  resolveTemplate,
  stepHref,
  stepIndexForLocation,
  stepIsReadOnly,
  stepsForRole,
  visibleMilestones,
  MILESTONE_BY_ID,
} from "@/lib/copilot/tour";
import { EMPTY_WORKSPACE_COUNTS, type WorkspaceCounts } from "@/lib/copilot/types";

const role = (code: string) => code as RoleCode;
const counts = (patch: Partial<WorkspaceCounts> = {}): WorkspaceCounts => ({ ...EMPTY_WORKSPACE_COUNTS, ...patch });

const skuMilestone = MILESTONE_BY_ID.get("sku-master")!;
const procurement = MILESTONE_BY_ID.get("procurement")!;

describe("path matching", () => {
  it("matches exact routes, with or without a trailing slash", () => {
    expect(matchesPath("/stock", "/stock")).toBe(true);
    expect(matchesPath("/stock", "/stock/")).toBe(true);
    expect(matchesPath("/stock", "/stock/STORE-1")).toBe(false);
  });

  it("treats a bracketed segment as exactly one path segment", () => {
    expect(matchesPath("/purchase-orders/[id]", "/purchase-orders/po_123")).toBe(true);
    expect(matchesPath("/purchase-orders/[id]", "/purchase-orders")).toBe(false);
    expect(matchesPath("/purchase-orders/[id]", "/purchase-orders/po_123/edit")).toBe(false);
  });

  it("treats a star as the rest of the path", () => {
    expect(matchesPath("/masters/*", "/masters/skus/labels")).toBe(true);
    expect(matchesPath("/masters/*", "/masters")).toBe(false);
  });

  it("ignores the query string of the pattern", () => {
    expect(matchesPath("/invoices?status=OPEN", "/invoices")).toBe(true);
  });

  it("does not let regex characters in a route act as a pattern", () => {
    expect(matchesPath("/reports/movements", "/reportsXmovements")).toBe(false);
  });

  it("matches comma-separated paths", () => {
    expect(matchesPath("/purchase-orders/[id], /grns/new", "/purchase-orders/po_123")).toBe(true);
    expect(matchesPath("/purchase-orders/[id], /grns/new", "/grns/new")).toBe(true);
    expect(matchesPath("/purchase-orders/[id], /grns/new", "/dispatches")).toBe(false);
  });

  it("matches prefix wildcard on skus", () => {
    expect(matchesPath("/masters/skus*", "/masters/skus")).toBe(true);
    expect(matchesPath("/masters/skus*", "/masters/skus/new")).toBe(true);
  });
});

describe("role access", () => {
  it("classifies full, read-only and hidden milestones", () => {
    expect(milestoneAccess(role("ADMIN"), skuMilestone)).toBe("full");
    expect(milestoneAccess(role("STORE_MANAGER"), skuMilestone)).toBe("read");
    expect(milestoneAccess(role("ACCOUNTS"), procurement)).toBe("hidden");
  });

  it("keeps only steps a role can execute", () => {
    const adminSteps = stepsForRole(role("ADMIN"), skuMilestone);
    expect(adminSteps).toHaveLength(skuMilestone.steps.length);

    const warehouseSteps = stepsForRole(role("WAREHOUSE_OPERATOR"), procurement);
    expect(warehouseSteps.map((step) => step.id)).toEqual([
      "grn-godown",
      "grn-batch",
      "grn-accepted",
      "grn-submit",
    ]);
  });

  it("collapses a read-only milestone to its single explanatory step", () => {
    const steps = stepsForRole(role("STORE_MANAGER"), skuMilestone);
    expect(steps).toEqual([skuMilestone.readStep]);
  });

  it("returns no steps for a hidden milestone", () => {
    expect(stepsForRole(role("ACCOUNTS"), procurement)).toEqual([]);
  });

  it("adapts the visible journey to the role", () => {
    expect(visibleMilestones(role("ADMIN")).map((milestone) => milestone.id)).toEqual([
      "sku-master",
      "procurement",
      "stock-audit",
      "invoicing",
      "dispatch",
      "reconciliation",
    ]);
    expect(visibleMilestones(role("MANAGEMENT")).map((milestone) => milestone.id)).toHaveLength(6);
    expect(visibleMilestones(role("ACCOUNTS")).map((milestone) => milestone.id)).toEqual([
      "sku-master",
      "stock-audit",
      "invoicing",
      "reconciliation",
    ]);
    expect(visibleMilestones(role("WAREHOUSE_OPERATOR")).map((milestone) => milestone.id)).toEqual([
      "sku-master",
      "procurement",
      "stock-audit",
      "dispatch",
    ]);
  });

  it("marks a step read-only when the role cannot perform its action", () => {
    const openPo = procurement.steps.find((step) => step.id === "open-po")!;
    expect(stepIsReadOnly(role("WAREHOUSE_OPERATOR"), procurement, openPo)).toBe(true);
    expect(stepIsReadOnly(role("ADMIN"), procurement, procurement.steps[1])).toBe(false);
    expect(stepIsReadOnly(role("MANAGEMENT"), procurement, procurement.readStep)).toBe(true);
  });
});

describe("href resolution", () => {
  it("substitutes workspace ids", () => {
    expect(resolveTemplate("/invoices/{latestInvoiceId}", counts({ latestInvoiceId: "inv_1" }))).toBe("/invoices/inv_1");
  });

  it("returns null when a placeholder has no value", () => {
    expect(resolveTemplate("/invoices/{latestInvoiceId}", counts())).toBeNull();
    expect(resolveTemplate("/x/{notAKey}", counts())).toBeNull();
  });

  it("builds a static fallback from a URL template", () => {
    expect(fallbackHref("/purchase-orders/{latestOpenPurchaseOrderId}")).toBe("/purchase-orders");
    expect(fallbackHref("/invoices/[id]?status=OPEN")).toBe("/invoices");
    expect(fallbackHref("/stock")).toBe("/stock");
  });

  it("falls back to the list screen when the document id is missing", () => {
    const step = skuMilestone.steps.find((candidate) => candidate.id === "open-sku-form")!;
    expect(stepHref(step, counts())).toBe("/masters/skus");

    const ledger = MILESTONE_BY_ID.get("stock-audit")!.steps.find((candidate) => candidate.id === "ledger")!;
    expect(stepHref(ledger, counts())).toBe("/ledger?movementType=INWARD");

    const completedInvoice = MILESTONE_BY_ID.get("reconciliation")!.steps[0];
    expect(stepHref(completedInvoice, counts())).toBe("/invoices");
    expect(stepHref(completedInvoice, counts({ latestInvoiceId: "inv_9" }))).toBe("/invoices/inv_9");
  });

  it("merges query params into an intent route", () => {
    expect(intentHref({ route: "/invoices", params: { status: "OPEN" } }, counts())).toBe("/invoices?status=OPEN");
    expect(intentHref({ route: "/invoices?page=2", params: { status: "OPEN" } }, counts())).toBe(
      "/invoices?page=2&status=OPEN",
    );
  });

  it("refuses an intent whose id placeholder is unresolved", () => {
    expect(intentHref({ route: "/invoices/{latestInvoiceId}" }, counts())).toBeNull();
    expect(intentHref({ route: "/invoices/{latestInvoiceId}" }, counts({ latestInvoiceId: "inv_2" }))).toBe(
      "/invoices/inv_2",
    );
  });
});

describe("step tracking", () => {
  it("prefers the current or next matching step", () => {
    const steps = skuMilestone.steps;
    expect(stepIndexForLocation(steps, "/masters/skus", 0)).toBe(0);
    expect(stepIndexForLocation(steps, "/masters/skus", 3)).toBe(3);
  });

  it("picks the closest earlier step when jumping back", () => {
    const steps = skuMilestone.steps;
    expect(stepIndexForLocation(steps, "/masters/skus", 99)).toBe(steps.length - 1);
  });

  it("returns null when the location is outside the milestone", () => {
    expect(stepIndexForLocation(skuMilestone.steps, "/invoices", 0)).toBeNull();
  });

  it("tracks progress over visible milestones only", () => {
    expect(progressForRole(role("ADMIN"), ["sku-master", "procurement", "nope"])).toEqual({ done: 2, total: 6 });
    expect(progressForRole(role("ACCOUNTS"), ["sku-master"])).toEqual({ done: 1, total: 4 });
  });

  it("moves to the next milestone the role can see", () => {
    expect(nextMilestone(role("ADMIN"), "sku-master")?.id).toBe("procurement");
    expect(nextMilestone(role("ACCOUNTS"), "sku-master")?.id).toBe("stock-audit");
    expect(nextMilestone(role("ADMIN"), "reconciliation")).toBeNull();
    expect(nextMilestone(role("ADMIN"), "unknown")?.id).toBe("sku-master");
  });
});
