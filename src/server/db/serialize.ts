import { isDecimal } from "./decimal";

/**
 * Converts Prisma values into JSON-safe data: Decimal → string (exact),
 * BigInt → string, Date → ISO string. Used for API responses and audit payloads.
 */
export function toPlainJson(value: unknown): unknown {
  if (value === null || value === undefined) return value ?? null;
  if (isDecimal(value)) return value.toString();
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(toPlainJson);
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value)) {
      if (v !== undefined) out[key] = toPlainJson(v);
    }
    return out;
  }
  return value;
}
