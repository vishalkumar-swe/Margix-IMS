import { describe, expect, it } from "vitest";
import { amountInWords, integerInWords } from "@/lib/amount-in-words";
import { formatAmount } from "@/lib/format";
import { gstStateLabel, partyStateCode, stateCodeOfGstin } from "@/lib/gst-states";

describe("integerInWords (Indian numbering)", () => {
  it("spells small numbers", () => {
    expect(integerInWords(0n)).toBe("Zero");
    expect(integerInWords(7n)).toBe("Seven");
    expect(integerInWords(45n)).toBe("Forty-Five");
    expect(integerInWords(100n)).toBe("One Hundred");
    expect(integerInWords(999n)).toBe("Nine Hundred Ninety-Nine");
  });

  it("uses thousand, lakh and crore", () => {
    expect(integerInWords(12_345n)).toBe("Twelve Thousand Three Hundred Forty-Five");
    expect(integerInWords(1_00_000n)).toBe("One Lakh");
    expect(integerInWords(12_34_567n)).toBe("Twelve Lakh Thirty-Four Thousand Five Hundred Sixty-Seven");
    expect(integerInWords(1_00_00_000n)).toBe("One Crore");
    expect(integerInWords(5_01_00_020n)).toBe("Five Crore One Lakh Twenty");
    expect(integerInWords(123_45_67_890n)).toBe(
      "One Hundred Twenty-Three Crore Forty-Five Lakh Sixty-Seven Thousand Eight Hundred Ninety",
    );
  });
});

describe("amountInWords", () => {
  it("adds rupees and paise", () => {
    expect(amountInWords("12345.50")).toBe("Rupees Twelve Thousand Three Hundred Forty-Five and Fifty Paise Only");
    expect(amountInWords("170002.86")).toBe("Rupees One Lakh Seventy Thousand Two and Eighty-Six Paise Only");
    expect(amountInWords("1000")).toBe("Rupees One Thousand Only");
    expect(amountInWords("0.05")).toBe("Rupees Zero and Five Paise Only");
  });
});

describe("formatAmount", () => {
  it("groups the Indian way with exactly two decimals", () => {
    expect(formatAmount("1234567.5")).toBe("12,34,567.50");
    expect(formatAmount("0")).toBe("0.00");
    expect(formatAmount("999.999")).toBe("999.99");
    expect(formatAmount("-1500")).toBe("−1,500.00");
  });
});

describe("GST states", () => {
  it("reads the state from a GSTIN, else the recorded state", () => {
    expect(stateCodeOfGstin("29AABCR5678K1Z2")).toBe("29");
    expect(stateCodeOfGstin("99AABCR5678K1Z2")).toBeNull();
    expect(stateCodeOfGstin(null)).toBeNull();
    expect(partyStateCode({ gstin: "27AAACG1234F1Z5", stateCode: "29" })).toBe("27");
    expect(partyStateCode({ gstin: null, stateCode: "29" })).toBe("29");
    expect(partyStateCode({ gstin: null, stateCode: null })).toBeNull();
    expect(gstStateLabel("29")).toBe("Karnataka (29)");
    expect(gstStateLabel(null)).toBe("—");
  });
});
