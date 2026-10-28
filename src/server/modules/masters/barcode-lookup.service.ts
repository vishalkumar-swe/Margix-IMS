import { prisma } from "@/server/db/client";
import { executeLlmChat, llmConfigured } from "@/server/modules/copilot/llm";
import { logger } from "@/server/observability/logger";

export interface SkuLookupPayload {
  id: string;
  code: string;
  name: string;
  description: string | null;
  categoryId: string | null;
  categoryName: string | null;
  baseUomId: string;
  uomCode: string;
  hsnCode: string | null;
  gstRate: string | null;
  barcode: string | null;
  status: string;
}

export interface CatalogProductDetails {
  name: string;
  brand?: string;
  description?: string;
  suggestedCategoryId?: string;
  suggestedCategoryName?: string;
  suggestedBaseUomId?: string;
  suggestedUomCode?: string;
  suggestedHsnCode?: string;
  suggestedGstRate?: string;
  confidence: "high" | "medium" | "low";
  source: "local" | "registry" | "ai" | "inferred";
}

export interface BarcodeLookupResult {
  barcode: string;
  foundInDatabase: boolean;
  sku?: SkuLookupPayload;
  catalogDetails?: CatalogProductDetails;
}

/** Queries public Open Food Facts registry for FMCG / food / commodity barcode metadata */
async function fetchFromOpenRegistry(barcode: string): Promise<{ name?: string; brand?: string; description?: string; uom?: string } | null> {
  try {
    const url = `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json`;
    const res = await fetch(url, {
      headers: { "User-Agent": "MargixIMS/1.0 (inventory@margixindia.com)" },
      signal: AbortSignal.timeout(2000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { status?: number; product?: Record<string, unknown> };
    if (data.status === 1 && data.product) {
      const p = data.product;
      const rawName = (p.product_name as string) || (p.product_name_en as string) || (p.generic_name as string);
      const brand = (p.brands as string) || undefined;
      const quantity = (p.quantity as string) || undefined;
      if (rawName && typeof rawName === "string" && rawName.trim()) {
        const cleanName = rawName.trim();
        const fullName = brand && !cleanName.toLowerCase().includes(brand.toLowerCase()) ? `${brand} ${cleanName}` : cleanName;
        const uomMatch = quantity ? quantity.match(/\b(kg|gm?|g|ltr?|l|ml|pcs|pack)\b/i)?.[0].toUpperCase() : undefined;
        return {
          name: fullName,
          brand,
          description: quantity ? `${fullName} (${quantity})` : fullName,
          uom: uomMatch,
        };
      }
    }
  } catch {
    // Non-blocking fallback to LLM
  }
  return null;
}

/** Queries LLM to identify commodity and product details from barcode and trade conventions */
async function identifyWithLlm(barcode: string): Promise<{
  name: string;
  brand?: string;
  description?: string;
  category?: string;
  uom?: string;
  hsnCode?: string;
  gstRate?: string;
} | null> {
  if (!llmConfigured()) return null;
  if (process.env.NODE_ENV === "test" && process.env.AI_API_KEY?.includes("test")) {
    return null;
  }
  try {
    const isIndian = barcode.startsWith("890");
    const prompt = `Identify the commercial product or agricultural commodity for barcode "${barcode}".
${isIndian ? "Note: Prefix 890 indicates GS1 India (Indian FMCG, grocery, spices, rice, grains, oil, or commodity)." : ""}
If you recognize the specific product variant, return its accurate commercial name and details.
If the exact brand variant is uncertain, infer the most likely commodity name, category, and standard GST/HSN.
Respond strictly in JSON with these keys:
{
  "name": "Commercial Product Name with Pack/Size if applicable",
  "brand": "Brand Name or Manufacturer",
  "description": "Short product description",
  "category": "Broad category (e.g. Grains & Pulses, Edible Oils, Spices, Packaged Goods, Confectionery, Dairy)",
  "uom": "Standard Unit (e.g. KG, GM, LTR, PCS, PACK, BOX)",
  "hsnCode": "HSN Code (4 to 8 digits)",
  "gstRate": "GST Rate percentage (e.g. 0, 5, 12, 18)"
}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    try {
      const res = await executeLlmChat({
        messages: [{ role: "user", content: prompt }],
        maxRounds: 1,
        signal: controller.signal,
      });

      const match = res.content.match(/\{[\s\S]*\}/);
      if (match) {
        const parsed = JSON.parse(match[0]);
        if (parsed.name && typeof parsed.name === "string" && parsed.name.trim()) {
          return {
            name: parsed.name.trim(),
            brand: parsed.brand ? String(parsed.brand).trim() : undefined,
            description: parsed.description ? String(parsed.description).trim() : undefined,
            category: parsed.category ? String(parsed.category).trim() : undefined,
            uom: parsed.uom ? String(parsed.uom).trim() : undefined,
            hsnCode: parsed.hsnCode ? String(parsed.hsnCode).replace(/\D/g, "") : undefined,
            gstRate: parsed.gstRate !== undefined ? String(parsed.gstRate).replace("%", "").trim() : undefined,
          };
        }
      }
    } finally {
      clearTimeout(timeout);
    }
  } catch (err) {
    logger.warn("AI barcode identification error", { barcode, err: String(err) });
  }
  return null;
}

/** Looks up barcode in internal database first, then external registry and AI */
export async function lookupBarcodeDetails(rawBarcode: string): Promise<BarcodeLookupResult> {
  const barcode = rawBarcode.trim();
  if (!barcode) {
    return { barcode: "", foundInDatabase: false };
  }

  // 1. Check local Margix master database
  const existingSku = await prisma.sku.findFirst({
    where: {
      OR: [
        { barcode },
        { code: { equals: barcode, mode: "insensitive" } },
      ],
    },
    include: {
      category: { select: { id: true, name: true } },
      baseUom: { select: { id: true, code: true } },
    },
  });

  if (existingSku) {
    return {
      barcode,
      foundInDatabase: true,
      sku: {
        id: existingSku.id,
        code: existingSku.code,
        name: existingSku.name,
        description: existingSku.description,
        categoryId: existingSku.categoryId,
        categoryName: existingSku.category?.name ?? null,
        baseUomId: existingSku.baseUomId,
        uomCode: existingSku.baseUom.code,
        hsnCode: existingSku.hsnCode,
        gstRate: existingSku.gstRate?.toString() ?? null,
        barcode: existingSku.barcode,
        status: existingSku.status,
      },
    };
  }

  // 2. Fetch master reference lists to match suggestions against actual system categories & UOMs
  const [categories, uoms, hsnCodes] = await Promise.all([
    prisma.category.findMany({ where: { isActive: true }, select: { id: true, name: true, hsnCode: true } }),
    prisma.uom.findMany({ select: { id: true, code: true, name: true } }),
    prisma.hsnCode.findMany({ where: { isActive: true }, select: { code: true, gstRate: true } }),
  ]);

  // 3. Try registry first, then AI
  const registryHit = await fetchFromOpenRegistry(barcode);
  const aiHit = await identifyWithLlm(barcode);

  let productName = registryHit?.name || aiHit?.name;
  let brand = registryHit?.brand || aiHit?.brand;
  let description = registryHit?.description || aiHit?.description;
  let suggestedCategoryName = aiHit?.category;
  let suggestedUomCode = registryHit?.uom || aiHit?.uom;
  let suggestedHsn = aiHit?.hsnCode;
  let suggestedGst = aiHit?.gstRate;
  let confidence: "high" | "medium" | "low" = registryHit ? "high" : aiHit ? "medium" : "low";
  let source: "registry" | "ai" | "inferred" = registryHit ? "registry" : aiHit ? "ai" : "inferred";

  // 4. Inferred fallback if registry and AI return nothing
  if (!productName) {
    if (barcode.startsWith("890")) {
      productName = `GS1 India Product (${barcode.slice(-6)})`;
      description = `Indian commercial product with barcode ${barcode}`;
      suggestedCategoryName = "General";
      suggestedUomCode = "PCS";
    } else {
      productName = `Scanned Item (${barcode})`;
      description = `Product identified by barcode ${barcode}`;
      suggestedUomCode = "PCS";
    }
  }

  // 5. Match category against existing DB categories
  let matchedCategoryId: string | undefined;
  if (suggestedCategoryName && categories.length > 0) {
    const sCat = suggestedCategoryName.toLowerCase();
    const matched = categories.find(
      (c) => c.name.toLowerCase() === sCat || sCat.includes(c.name.toLowerCase()) || c.name.toLowerCase().includes(sCat),
    );
    if (matched) {
      matchedCategoryId = matched.id;
      suggestedCategoryName = matched.name;
      if (!suggestedHsn && matched.hsnCode) {
        suggestedHsn = matched.hsnCode;
      }
    }
  }
  if (!matchedCategoryId && categories.length > 0) {
    // If no direct category match, pick the first active category as default fallback
    matchedCategoryId = categories[0].id;
    suggestedCategoryName = categories[0].name;
  }

  // 6. Match UOM against existing DB UOMs
  let matchedBaseUomId: string | undefined;
  if (suggestedUomCode && uoms.length > 0) {
    const norm = suggestedUomCode.toUpperCase().replace(/\./g, "");
    const aliasMap: Record<string, string> = {
      KGS: "KG",
      KILOGRAM: "KG",
      KILOGRAMS: "KG",
      G: "GM",
      GRAM: "GM",
      GRAMS: "GM",
      L: "LTR",
      LITRE: "LTR",
      LITER: "LTR",
      LITRES: "LTR",
      LITERS: "LTR",
      PIECE: "PCS",
      PIECES: "PCS",
      PC: "PCS",
      NUMBERS: "NOS",
      NUMBER: "NOS",
      BOXES: "BOX",
      BAGS: "BAG",
    };
    const targetCode = aliasMap[norm] || norm;
    const foundUom = uoms.find((u) => u.code.toUpperCase() === targetCode) || uoms.find((u) => u.name.toUpperCase().includes(targetCode));
    if (foundUom) {
      matchedBaseUomId = foundUom.id;
      suggestedUomCode = foundUom.code;
    }
  }
  if (!matchedBaseUomId && uoms.length > 0) {
    // Match common default (PCS or KG or first UOM)
    const defaultUom = uoms.find((u) => u.code.toUpperCase() === "PCS" || u.code.toUpperCase() === "KG") || uoms[0];
    matchedBaseUomId = defaultUom.id;
    suggestedUomCode = defaultUom.code;
  }

  // 7. Verify or look up GST rate from HSN master if HSN code is present
  if (suggestedHsn && hsnCodes.length > 0) {
    const hsnCodeStr = suggestedHsn;
    const exactHsn = hsnCodes.find((h) => h.code === hsnCodeStr) || hsnCodes.find((h) => h.code.startsWith(hsnCodeStr.slice(0, 4)));
    if (exactHsn) {
      suggestedHsn = exactHsn.code;
      suggestedGst = exactHsn.gstRate.toString();
    }
  }

  return {
    barcode,
    foundInDatabase: false,
    catalogDetails: {
      name: productName,
      brand,
      description,
      suggestedCategoryId: matchedCategoryId,
      suggestedCategoryName,
      suggestedBaseUomId: matchedBaseUomId,
      suggestedUomCode,
      suggestedHsnCode: suggestedHsn,
      suggestedGstRate: suggestedGst,
      confidence,
      source,
    },
  };
}
