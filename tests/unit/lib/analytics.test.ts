import { describe, expect, it } from "vitest";
import {
  bucketKey,
  bucketKeys,
  bucketLabel,
  fillSeries,
  financialYearStart,
  granularityFor,
  MAX_PERIOD_DAYS,
  percentChange,
  periodDays,
  presetPeriod,
  previousPeriod,
  quarterStart,
  resolvePeriod,
} from "@/lib/analytics";
import { formatCompactNumber, formatMoney, formatPercentChange } from "@/lib/format";
import { analyticsExportQuerySchema, analyticsQuerySchema } from "@/lib/validation/analytics";

describe("period presets", () => {
  const today = "2026-09-24";

  it("resolves rolling and to-date presets", () => {
    expect(presetPeriod("today", today)).toEqual({ from: today, to: today });
    expect(presetPeriod("7d", today)).toEqual({ from: "2026-09-18", to: today });
    expect(presetPeriod("30d", today)).toEqual({ from: "2026-08-26", to: today });
    expect(presetPeriod("month", today)).toEqual({ from: "2026-09-01", to: today });
    expect(presetPeriod("quarter", today)).toEqual({ from: "2026-07-01", to: today });
    expect(presetPeriod("fy", today)).toEqual({ from: "2026-04-01", to: today });
  });

  it("uses the Indian financial year (April–March)", () => {
    expect(financialYearStart("2026-04-01")).toBe("2026-04-01");
    expect(financialYearStart("2026-03-31")).toBe("2025-04-01");
    expect(financialYearStart("2027-01-15")).toBe("2026-04-01");
    expect(presetPeriod("fy", "2027-02-10")).toEqual({ from: "2026-04-01", to: "2027-02-10" });
    expect(quarterStart("2027-02-10")).toBe("2027-01-01");
    expect(quarterStart("2026-12-31")).toBe("2026-10-01");
    expect(quarterStart("2026-04-30")).toBe("2026-04-01");
  });

  it("prefers an explicit range and defaults to the last 30 days", () => {
    expect(resolvePeriod({}, today)).toEqual({ preset: "30d", period: { from: "2026-08-26", to: today } });
    expect(resolvePeriod({ preset: "fy" }, today).period.from).toBe("2026-04-01");
    expect(resolvePeriod({ from: "2026-01-01", to: "2026-01-31" }, today)).toEqual({
      preset: "custom",
      period: { from: "2026-01-01", to: "2026-01-31" },
    });
    expect(resolvePeriod({ preset: "custom", to: "2026-05-20" }, today).period).toEqual({ from: "2026-05-01", to: "2026-05-20" });
    const clamped = resolvePeriod({ preset: "custom", from: "2015-01-01" }, today).period;
    expect(periodDays(clamped)).toBe(MAX_PERIOD_DAYS);
  });

  it("compares with the previous period of equal length", () => {
    expect(previousPeriod({ from: "2026-09-24", to: "2026-09-24" })).toEqual({ from: "2026-09-23", to: "2026-09-23" });
    expect(previousPeriod({ from: "2026-03-01", to: "2026-03-31" })).toEqual({ from: "2026-01-29", to: "2026-02-28" });
    expect(periodDays({ from: "2024-02-01", to: "2024-02-29" })).toBe(29);
  });
});

describe("time buckets", () => {
  it("picks day, week or month granularity from the period length", () => {
    expect(granularityFor({ from: "2026-09-01", to: "2026-09-30" })).toBe("day");
    expect(granularityFor({ from: "2026-07-01", to: "2026-09-30" })).toBe("week");
    expect(granularityFor({ from: "2026-04-01", to: "2027-03-31" })).toBe("month");
  });

  it("keys weeks by their Monday and months by their first day", () => {
    expect(bucketKey("2026-09-24", "day")).toBe("2026-09-24");
    expect(bucketKey("2026-09-24", "week")).toBe("2026-09-21"); // Thursday → Monday
    expect(bucketKey("2026-09-21", "week")).toBe("2026-09-21");
    expect(bucketKey("2026-09-27", "week")).toBe("2026-09-21"); // Sunday belongs to the week before
    expect(bucketKey("2027-01-01", "week")).toBe("2026-12-28");
    expect(bucketKey("2026-09-24", "month")).toBe("2026-09-01");
  });

  it("lists every bucket of a period, including partial ones at the edges", () => {
    expect(bucketKeys({ from: "2026-09-29", to: "2026-10-02" }, "day")).toEqual([
      "2026-09-29",
      "2026-09-30",
      "2026-10-01",
      "2026-10-02",
    ]);
    expect(bucketKeys({ from: "2026-09-24", to: "2026-10-06" }, "week")).toEqual(["2026-09-21", "2026-09-28", "2026-10-05"]);
    expect(bucketKeys({ from: "2026-04-15", to: "2027-03-31" }, "month")).toHaveLength(12);
    expect(bucketKeys({ from: "2027-01-31", to: "2027-03-01" }, "month")).toEqual(["2027-01-01", "2027-02-01", "2027-03-01"]);
  });

  it("labels buckets and fills gaps with zero", () => {
    expect(bucketLabel("2026-09-24", "day")).toBe("24 Sep");
    expect(bucketLabel("2026-09-21", "week")).toBe("w/c 21 Sep");
    expect(bucketLabel("2026-09-01", "month")).toBe("Sep 2026");
    expect(
      fillSeries({ from: "2026-09-01", to: "2026-09-03" }, "day", [{ bucket: "2026-09-02", sales: "10.00" }], ["sales", "gst"]),
    ).toEqual([
      { bucket: "2026-09-01", label: "1 Sep", values: { sales: "0", gst: "0" } },
      { bucket: "2026-09-02", label: "2 Sep", values: { sales: "10.00", gst: "0" } },
      { bucket: "2026-09-03", label: "3 Sep", values: { sales: "0", gst: "0" } },
    ]);
  });
});

describe("comparisons and formatting", () => {
  it("computes percentage change against the previous value", () => {
    expect(percentChange("150", "100")).toBe(50);
    expect(percentChange("75.00", "100.00")).toBe(-25);
    expect(percentChange("1", "3")).toBe(-66.7);
    expect(percentChange("10", "-20")).toBe(150);
    expect(percentChange("0", "0")).toBe(0);
    expect(percentChange("10", "0")).toBeNull();
  });

  it("formats rupees, compact axis values and changes the Indian way", () => {
    expect(formatMoney("1234567.5")).toBe("₹12,34,567.50");
    expect(formatMoney("0")).toBe("₹0.00");
    expect(formatMoney("-275.00")).toBe("−₹275.00");
    expect(formatCompactNumber(950)).toBe("950");
    expect(formatCompactNumber(12_500)).toBe("12.5K");
    expect(formatCompactNumber(1_250_000)).toBe("12.5L");
    expect(formatCompactNumber(32_000_000)).toBe("3.2Cr");
    expect(formatCompactNumber(-100_000)).toBe("−1L");
    expect(formatPercentChange(12.5)).toBe("+12.5%");
    expect(formatPercentChange(-3)).toBe("−3%");
    expect(formatPercentChange(0)).toBe("0%");
  });
});

describe("analytics query validation", () => {
  it("defaults the tab and rejects inverted or overlong ranges", () => {
    expect(analyticsQuerySchema.parse({})).toEqual({ tab: "overview" });
    expect(analyticsQuerySchema.safeParse({ from: "2026-09-10", to: "2026-09-01" }).success).toBe(false);
    expect(analyticsQuerySchema.safeParse({ from: "2020-01-01", to: "2026-09-01" }).success).toBe(false);
    expect(analyticsExportQuerySchema.safeParse({ section: "sales-trend", preset: "fy" }).success).toBe(true);
    expect(analyticsExportQuerySchema.safeParse({ section: "everything" }).success).toBe(false);
  });
});
