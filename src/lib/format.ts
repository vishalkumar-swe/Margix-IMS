/** Display formatting shared by server and client. */

/** Ledger entry number as shown to users, e.g. 123n → "LE-000123". */
export function formatEntryNo(entryNo: bigint | number | string): string {
  return `LE-${String(entryNo).padStart(6, "0")}`;
}

/**
 * Formats a decimal string with Indian digit grouping without going through a
 * float, e.g. "1234567.500" → "12,34,567.5".
 */
export function formatQuantity(value: string | number | { toString(): string }): string {
  const text = String(value);
  const negative = text.startsWith("-");
  const [intPart, fracPart = ""] = text.replace("-", "").split(".");
  const trimmedFrac = fracPart.replace(/0+$/, "");

  const lastThree = intPart.slice(-3);
  const rest = intPart.slice(0, -3);
  const grouped = rest ? `${rest.replace(/\B(?=(\d{2})+(?!\d))/g, ",")},${lastThree}` : lastThree;

  return `${negative ? "−" : ""}${grouped}${trimmedFrac ? `.${trimmedFrac}` : ""}`;
}

/** True for any representation of zero ("0", "0.000", "-0"). */
export function isZeroQuantity(value: string | number | { toString(): string }): boolean {
  return /^-?0*(\.0*)?$/.test(String(value));
}

/** Signed quantity with an explicit "+" for increases, e.g. "+500", "−200"; zero is unsigned. */
export function formatSignedQuantity(value: string | number | { toString(): string }): string {
  const text = String(value);
  if (isZeroQuantity(text)) return "0";
  return text.startsWith("-") ? formatQuantity(text) : `+${formatQuantity(text)}`;
}

/** Flips the sign of a decimal string, e.g. "500" → "-500", "-25" → "25". */
export function negateQuantity(value: string): string {
  return value.startsWith("-") ? value.slice(1) : `-${value}`;
}

/** Human label for enum-like codes, e.g. "PARTIALLY_RECEIVED" → "Partially received". */
export function humanize(code: string): string {
  const lower = code.toLowerCase().replace(/_/g, " ");
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

/**
 * Rupee amount from a decimal string with Indian grouping and exactly two
 * decimals, e.g. "1234567.5" → "₹12,34,567.50". No float conversion.
 */
export function formatMoney(value: string | number | { toString(): string }): string {
  const text = String(value);
  const negative = text.startsWith("-") && !isZeroQuantity(text);
  const [intPart, fracPart = ""] = text.replace("-", "").split(".");
  return `${negative ? "−" : ""}₹${formatQuantity(intPart || "0")}.${fracPart.padEnd(2, "0").slice(0, 2)}`;
}

/**
 * Short Indian-style number for chart axes and compact labels: thousands (K),
 * lakhs (L) and crores (Cr), e.g. 1250000 → "12.5L". Display only.
 */
export function formatCompactNumber(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? "−" : "";
  const scaled = (divisor: number, suffix: string) => {
    const n = abs / divisor;
    return `${sign}${n.toFixed(n >= 100 ? 0 : 1).replace(/\.0$/, "")}${suffix}`;
  };
  if (abs >= 1e7) return scaled(1e7, "Cr");
  if (abs >= 1e5) return scaled(1e5, "L");
  if (abs >= 1e3) return scaled(1e3, "K");
  return `${sign}${Number(abs.toFixed(2))}`;
}

/** Signed percentage with at most one decimal, e.g. 12.5 → "+12.5%", -3 → "−3%". */
export function formatPercentChange(value: number): string {
  const text = `${Math.abs(value).toFixed(1).replace(/\.0$/, "")}%`;
  return value > 0 ? `+${text}` : value < 0 ? `−${text}` : text;
}
