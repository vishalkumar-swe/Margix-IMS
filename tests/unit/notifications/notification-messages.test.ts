import { describe, expect, it } from "vitest";
import {
  digestMessage,
  lowStockMessage,
  oneLine,
  slowMovingMessage,
  testMessage,
  type AlertLine,
} from "@/server/modules/notifications/notification-messages";

const resin: AlertLine = {
  skuCode: "RM-001",
  skuName: "PET Resin",
  godownName: "Main Warehouse",
  unit: "KG",
  currentQty: "8.000",
  thresholdQty: "20.000",
};

describe("low-stock message", () => {
  it("follows the client's wording with product, current stock, minimum and action", () => {
    const message = lowStockMessage(resin);
    expect(message.text).toBe(
      "Low Stock Alert: Product PET Resin (RM-001) at Main Warehouse, Current Stock: 8 KG, " +
        "Minimum Required: 20 KG, Action Required: Reorder stock.",
    );
    expect(message.subject).toBe("Low Stock Alert: PET Resin (RM-001)");
    expect(message.alertType).toBe("LOW_STOCK");
    expect(message.link).toBe("/alerts");
  });

  it("fills the WhatsApp low-stock template with product, current and minimum", () => {
    expect(lowStockMessage(resin).whatsapp).toEqual({
      template: "LOW_STOCK",
      params: ["PET Resin (RM-001) at Main Warehouse", "8 KG", "20 KG"],
    });
  });

  it("formats large and fractional quantities exactly, with Indian grouping", () => {
    const message = lowStockMessage({ ...resin, currentQty: "1234567.500", thresholdQty: "2500000" });
    expect(message.text).toContain("Current Stock: 12,34,567.5 KG");
    expect(message.text).toContain("Minimum Required: 25,00,000 KG");
  });
});

describe("summaries", () => {
  const lines: AlertLine[] = [
    resin,
    { ...resin, skuCode: "PK-010", skuName: "Carton", unit: "PCS", currentQty: "0", thresholdQty: "100" },
  ];

  it("lists every product in a low-stock digest", () => {
    const message = digestMessage("LOW_STOCK", lines, "2026-09-24");
    expect(message.subject).toBe("Low Stock Digest 24 Sept 2026: 2 products at or below minimum");
    expect(message.text.split("\n")).toEqual([
      "Low Stock Digest 24 Sept 2026: 2 products at or below minimum",
      "",
      "- PET Resin (RM-001) at Main Warehouse: 8 KG (minimum 20 KG)",
      "- Carton (PK-010) at Main Warehouse: 0 PCS (minimum 100 PCS)",
      "",
      "Action Required: Reorder stock.",
    ]);
    expect(message.whatsapp.template).toBe("SUMMARY");
    expect(message.whatsapp.params).toHaveLength(1);
    expect(message.whatsapp.params[0]).not.toMatch(/\n/);
  });

  it("describes slow-moving items with their idle days", () => {
    const message = slowMovingMessage([{ ...resin, daysIdle: 45 }], 30);
    expect(message.subject).toBe("Slow-Moving Stock: 1 product with no movement for 30+ days");
    expect(message.text).toContain("- PET Resin (RM-001) at Main Warehouse: 8 KG, idle 45 days");
    expect(message.link).toBe("/reports/slow-stock");
    expect(message.alertType).toBe("SLOW_MOVING");
  });

  it("caps long lists with a count of the rest", () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ ...resin, skuCode: `RM-${i}` }));
    const message = digestMessage("SLOW_MOVING", many, "2026-09-24");
    expect(message.text).toContain("…and 5 more");
    expect(message.text.match(/^- /gm)).toHaveLength(26);
  });

  it("builds a channel test message", () => {
    expect(testMessage("E-mail").text).toBe("Test message from Margix IMS: E-mail notifications are working.");
  });
});

describe("WhatsApp parameter hygiene", () => {
  it("removes new lines, tabs and runs of spaces, and truncates to 1024 characters", () => {
    expect(oneLine("a\nb\t c     d")).toBe("a b c d");
    const long = oneLine("x".repeat(2000));
    expect(long).toHaveLength(1024);
    expect(long.endsWith("…")).toBe(true);
  });
});
