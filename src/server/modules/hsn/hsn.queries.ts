import type { Prisma } from "@prisma/client";
import type { HsnSuggestQuery } from "@/lib/validation/hsn";
import type { PageQuery } from "@/lib/validation/common";
import { prisma } from "@/server/db/client";

export async function listHsnCodes(query: PageQuery & { activeOnly?: boolean }) {
  const where: Prisma.HsnCodeWhereInput = {
    isActive: query.activeOnly ? true : undefined,
    OR: query.q
      ? [
          { code: { startsWith: query.q.replace(/\s/g, "") } },
          { description: { contains: query.q, mode: "insensitive" } },
          { keywords: { contains: query.q, mode: "insensitive" } },
        ]
      : undefined,
  };
  const [items, total] = await prisma.$transaction([
    prisma.hsnCode.findMany({
      where,
      orderBy: { code: "asc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      include: { _count: { select: { skus: true, categories: true } } },
    }),
    prisma.hsnCode.count({ where }),
  ]);
  return { items, total };
}

export function getHsnCode(code: string) {
  return prisma.hsnCode.findUnique({ where: { code } });
}

export interface HsnSuggestion {
  code: string;
  description: string;
  gstRate: string;
  /** Why it is suggested, e.g. "Default for category Packaging". */
  reason: string;
}

const STOP_WORDS = new Set(["and", "for", "the", "with", "of", "in", "large", "small", "medium", "pack", "set", "new"]);

/** Lower-case words of 3+ letters, safe to put in a tsquery. */
function searchTokens(...texts: (string | undefined)[]): string[] {
  const words = texts
    .join(" ")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3 && !STOP_WORDS.has(w) && !/^\d+$/.test(w));
  return [...new Set(words)].slice(0, 12);
}

/**
 * Recommends HSN codes for a product, strongest first: the category's default,
 * codes already used for similarly named products (so every confirmed mapping
 * improves later suggestions), then HSN descriptions matching the words.
 * Only active codes are suggested; the user can always pick another one.
 */
export async function suggestHsnCodes(input: HsnSuggestQuery, limit = 5): Promise<HsnSuggestion[]> {
  const found = new Map<string, HsnSuggestion>();
  const add = (row: { code: string; description: string; gstRate: Prisma.Decimal | string }, reason: string) => {
    if (!found.has(row.code)) found.set(row.code, { code: row.code, description: row.description, gstRate: String(row.gstRate), reason });
  };

  if (input.categoryId) {
    const category = await prisma.category.findUnique({ where: { id: input.categoryId }, include: { hsn: true } });
    if (category?.hsn?.isActive) add(category.hsn, `Default for category ${category.name}`);
  }

  const tokens = searchTokens(input.name, input.description);
  if (tokens.length > 0) {
    const tsquery = tokens.join(" | ");
    const similar = await prisma.$queryRaw<{ code: string; description: string; gst_rate: string; sku_code: string; sku_name: string }[]>`
      SELECT h."code", h."description", h."gst_rate"::text, s."code" AS sku_code, s."name" AS sku_name
      FROM "sku" s
      JOIN "hsn_code" h ON h."code" = s."hsn_code" AND h."is_active"
      WHERE to_tsvector('english', s."name" || ' ' || coalesce(s."description", '')) @@ to_tsquery('english', ${tsquery})
      ORDER BY ts_rank(to_tsvector('english', s."name" || ' ' || coalesce(s."description", '')), to_tsquery('english', ${tsquery})) DESC,
               s."updated_at" DESC
      LIMIT 10`;
    for (const row of similar) {
      add({ code: row.code, description: row.description, gstRate: row.gst_rate }, `Used for ${row.sku_code} · ${row.sku_name}`);
    }

    const matches = await prisma.$queryRaw<{ code: string; description: string; gst_rate: string }[]>`
      SELECT "code", "description", "gst_rate"::text
      FROM "hsn_code"
      WHERE "is_active"
        AND to_tsvector('english', "description" || ' ' || coalesce("keywords", '')) @@ to_tsquery('english', ${tsquery})
      ORDER BY ts_rank(to_tsvector('english', "description" || ' ' || coalesce("keywords", '')), to_tsquery('english', ${tsquery})) DESC,
               length("code") DESC
      LIMIT 10`;
    for (const row of matches) add({ code: row.code, description: row.description, gstRate: row.gst_rate }, "Matches the product description");
  }

  return [...found.values()].slice(0, limit);
}
