import { describe, expect, it } from "vitest";
import { toDecimal } from "@/server/db/decimal";
import { allocateFefo, type BatchStock } from "@/server/modules/inventory/fefo";

const today = new Date("2026-09-24T00:00:00Z");
const batch = (batchNumber: string, quantity: string, expiry: string | null): BatchStock => ({
  batchId: batchNumber,
  batchNumber,
  quantity: toDecimal(quantity),
  expiryDate: expiry ? new Date(`${expiry}T00:00:00Z`) : null,
});
const summary = (result: ReturnType<typeof allocateFefo>) => ({
  picks: result.allocations.map((a) => `${a.batchNumber}:${a.quantity.toString()}`),
  shortfall: result.shortfall.toString(),
});

describe("allocateFefo", () => {
  const stock = [
    batch("NO-EXPIRY", "100", null),
    batch("LATE", "50", "2027-06-30"),
    batch("SOON", "30", "2026-10-31"),
    batch("EXPIRED", "999", "2026-09-01"),
  ];

  it("takes the earliest-expiring batch first and splits across batches", () => {
    expect(summary(allocateFefo(stock, toDecimal("60"), today))).toEqual({
      picks: ["SOON:30", "LATE:30"],
      shortfall: "0",
    });
  });

  it("uses batches without expiry last and never offers expired stock", () => {
    expect(summary(allocateFefo(stock, toDecimal("200"), today))).toEqual({
      picks: ["SOON:30", "LATE:50", "NO-EXPIRY:100"],
      shortfall: "20",
    });
  });

  it("treats a batch expiring today as still usable and keeps decimals exact", () => {
    const result = allocateFefo([batch("TODAY", "0.3", "2026-09-24"), batch("NEXT", "5", "2026-12-01")], toDecimal("0.5"), today);
    expect(summary(result)).toEqual({ picks: ["TODAY:0.3", "NEXT:0.2"], shortfall: "0" });
  });
});
