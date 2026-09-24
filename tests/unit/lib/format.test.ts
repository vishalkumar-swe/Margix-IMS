import { describe, expect, it } from "vitest";
import { dateOnlyToUtc, utcToDateOnly } from "@/lib/dates";
import { formatEntryNo, formatQuantity, formatSignedQuantity, humanize, negateQuantity } from "@/lib/format";

describe("formatting", () => {
  it("formats quantities with Indian grouping and no float drift", () => {
    expect(formatQuantity("1234567.500")).toBe("12,34,567.5");
    expect(formatQuantity("575.000")).toBe("575");
    expect(formatQuantity("-1000")).toBe("−1,000");
    expect(formatQuantity("0.001")).toBe("0.001");
  });

  it("shows signs explicitly for movements", () => {
    expect(formatSignedQuantity("500")).toBe("+500");
    expect(formatSignedQuantity("-25")).toBe("−25");
    expect(negateQuantity("500")).toBe("-500");
    expect(negateQuantity("-25")).toBe("25");
  });

  it("formats identifiers and codes", () => {
    expect(formatEntryNo(123n)).toBe("LE-000123");
    expect(humanize("PARTIALLY_RECEIVED")).toBe("Partially received");
  });

  it("round-trips calendar dates without timezone shifts", () => {
    expect(utcToDateOnly(dateOnlyToUtc("2027-03-31"))).toBe("2027-03-31");
  });
});
