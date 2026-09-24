import type { z } from "zod";

type RawSearchParams = Record<string, string | string[] | undefined>;

/**
 * Parses a page's searchParams with the same zod schema the API uses. Invalid
 * values are dropped (falling back to defaults) instead of breaking the page.
 */
export function parseSearchParams<S extends z.ZodType>(schema: S, raw: RawSearchParams): z.output<S> {
  const flat: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === "string" && value !== "") flat[key] = value;
  }

  const result = schema.safeParse(flat);
  if (result.success) return result.data;

  // Retry without the offending keys so one bad filter does not reset the others.
  for (const issue of result.error.issues) delete flat[String(issue.path[0])];
  return schema.parse(flat);
}
