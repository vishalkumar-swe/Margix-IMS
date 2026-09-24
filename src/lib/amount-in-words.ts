/**
 * Rupee amounts in words with Indian numbering (thousand, lakh, crore), as
 * printed on tax invoices: "12345.50" → "Rupees Twelve Thousand Three Hundred
 * Forty-Five and Fifty Paise Only".
 */

import { parseScaled } from "@/lib/tax";

const ONES = [
  "Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
  "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen",
];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

/** 0–99. */
function twoDigits(n: number): string {
  if (n < 20) return ONES[n];
  const ones = n % 10;
  return ones ? `${TENS[Math.floor(n / 10)]}-${ONES[ones]}` : TENS[Math.floor(n / 10)];
}

/** 1–999. */
function threeDigits(n: number): string {
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  const parts = [];
  if (hundreds) parts.push(`${ONES[hundreds]} Hundred`);
  if (rest) parts.push(twoDigits(rest));
  return parts.join(" ");
}

/** A whole number in words, Indian system; above 99 crore the crore count is itself spelt out. */
export function integerInWords(value: bigint): string {
  if (value === 0n) return "Zero";
  const parts: string[] = [];
  const crores = value / 10_000_000n;
  let rest = Number(value % 10_000_000n);
  if (crores > 0n) parts.push(`${integerInWords(crores)} Crore`);
  const lakhs = Math.floor(rest / 100_000);
  rest %= 100_000;
  const thousands = Math.floor(rest / 1000);
  rest %= 1000;
  if (lakhs) parts.push(`${twoDigits(lakhs)} Lakh`);
  if (thousands) parts.push(`${twoDigits(thousands)} Thousand`);
  if (rest) parts.push(threeDigits(rest));
  return parts.join(" ");
}

/** "Rupees … and … Paise Only" for a non-negative amount with up to 2 decimals. */
export function amountInWords(amount: string): string {
  const paise = parseScaled(amount, 2) ?? 0n;
  const rupees = paise / 100n;
  const cents = Number(paise % 100n);
  const rupeeWords = `Rupees ${integerInWords(rupees)}`;
  return cents ? `${rupeeWords} and ${twoDigits(cents)} Paise Only` : `${rupeeWords} Only`;
}
