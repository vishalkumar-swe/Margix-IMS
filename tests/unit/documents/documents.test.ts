import { describe, expect, it } from "vitest";
import { derivePostedDocStatus, financialYearCode } from "@/server/modules/documents/documents.service";

describe("financialYearCode", () => {
  it.each([
    ["2026-04-01T00:00:00+05:30", "2627"],
    ["2026-03-31T23:59:59+05:30", "2526"],
    ["2026-12-31T12:00:00+05:30", "2627"],
    ["2027-01-15T12:00:00+05:30", "2627"],
    // 31 Mar 2026 20:00 UTC is already 1 Apr 2026 in IST.
    ["2026-03-31T20:00:00Z", "2627"],
    ["2099-06-01T00:00:00+05:30", "9900"],
  ])("%s → %s", (iso, expected) => {
    expect(financialYearCode(new Date(iso))).toBe(expected);
  });
});

describe("derivePostedDocStatus", () => {
  it("reflects how many entries were reversed", () => {
    expect(derivePostedDocStatus(3, 0)).toBe("POSTED");
    expect(derivePostedDocStatus(3, 1)).toBe("PARTIALLY_REVERSED");
    expect(derivePostedDocStatus(3, 3)).toBe("REVERSED");
  });
});
