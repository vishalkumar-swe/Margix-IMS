import { prisma } from "@/server/db/client";
import { executeLlmChat, llmConfigured } from "@/server/modules/copilot/llm";
import { logger } from "@/server/observability/logger";

export interface Gs1PrefixHint {
  prefix: string;
  manufacturer: string;
  brand: string;
  category: string;
  defaultUom: string;
  defaultHsn?: string;
  defaultGst?: string;
}

export interface DiscoveredProduct {
  barcode: string;
  name: string;
  brand?: string;
  description?: string;
  category?: string;
  uom?: string;
  hsnCode?: string;
  gstRate?: string;
  confidence: "high" | "medium" | "low";
  source: "registry" | "searxng" | "ai" | "inferred";
}

export function cleanCategoryName(raw: string): string {
  return raw
    .trim()
    .replace(/[_/]/g, " ")
    .replace(/\s+/g, " ")
    .split(" ")
    .map((w) =>
      w.length <= 2 && w.toLowerCase() !== "in" && w.toLowerCase() !== "of"
        ? w.toUpperCase()
        : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase(),
    )
    .join(" ");
}

export function cleanCommercialProductName(rawName: string, brand?: string): string {
  let name = rawName.trim().replace(/\s+/g, " ");

  if (brand && brand.trim()) {
    const b = brand.trim();
    const escapedBrand = b.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const duplicateBrandRegex = new RegExp(`^(${escapedBrand})\\s+(${escapedBrand})\\b`, "i");
    name = name.replace(duplicateBrandRegex, "$1");
  }

  if (name === name.toUpperCase() && name.length > 3) {
    name = name
      .toLowerCase()
      .split(" ")
      .map((word) => {
        if (["kg", "gm", "g", "ltr", "l", "ml", "pcs", "pack", "fmcg", "gs1", "hsn", "gst", "sku"].includes(word)) {
          return word.toUpperCase();
        }
        return word.charAt(0).toUpperCase() + word.slice(1);
      })
      .join(" ");
  }

  name = name.replace(/[\s,.-]+$/, "").trim();
  return name;
}

/**
 * Open-Source Barcode Discovery Service
 * Queries open registries (Open Food Facts, Open Beauty Facts, Open Products Facts)
 * and SearXNG e-commerce search, extracts structured details with Gemini AI,
 * and writes through to PostgreSQL global_product_catalog.
 */
export class BarcodeDiscoveryService {
  private userAgent = "MargixIMS/1.0 (https://ims.margixindia.com; inventory@margixindia.com)";

  /**
   * Primary discovery coordinator:
   * 1. Query Open Food Facts
   * 2. Query Open Beauty Facts (soaps, lotions, cosmetics)
   * 3. Query Open Products Facts (water, household, stationery)
   * 4. Query SearXNG / Web Search + AI
   * 5. If found, write through to PostgreSQL global_product_catalog
   */
  async discover(barcode: string, prefixHint?: Gs1PrefixHint | null): Promise<DiscoveredProduct | null> {
    const cleanCode = barcode.trim();
    if (!cleanCode) return null;

    // 1. Try Open Food Facts
    const food = await this.queryOpenFoodFacts(cleanCode);
    if (food) {
      await this.persistToGlobalCatalog(food);
      return food;
    }

    // 2. Try Open Beauty Facts (Personal Care, Bathing Soaps, Lotions, Creams)
    const beauty = await this.queryOpenBeautyFacts(cleanCode);
    if (beauty) {
      await this.persistToGlobalCatalog(beauty);
      return beauty;
    }

    // 3. Try Open Products Facts (Bottled Water, Detergents, Household, Commodities)
    const product = await this.queryOpenProductsFacts(cleanCode);
    if (product) {
      await this.persistToGlobalCatalog(product);
      return product;
    }

    // 4. Try Live Web Search via SearXNG + AI Extraction
    const web = await this.queryWebAndExtract(cleanCode, prefixHint);
    if (web) {
      await this.persistToGlobalCatalog(web);
      return web;
    }

    return null;
  }

  /**
   * Queries Open Food Facts public JSON API
   */
  async queryOpenFoodFacts(barcode: string): Promise<DiscoveredProduct | null> {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      const url = `https://world.openfoodfacts.org/api/v0/product/${encodeURIComponent(barcode)}.json`;
      const res = await fetch(url, {
        headers: { "User-Agent": this.userAgent },
        signal: controller.signal,
      }).finally(() => clearTimeout(timer));

      if (!res.ok) return null;
      const data = await res.json();
      if (data.status === 1 && data.product) {
        return this.parseOpenRegistryProduct(barcode, data.product, "Food & Packaged Goods");
      }
    } catch (err) {
      logger.debug("Open Food Facts lookup failed or timed out", { barcode, err: String(err) });
    }
    return null;
  }

  /**
   * Queries Open Beauty Facts public JSON API (soaps, lotions, skin creams, cosmetics)
   */
  async queryOpenBeautyFacts(barcode: string): Promise<DiscoveredProduct | null> {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      const url = `https://world.openbeautyfacts.org/api/v0/product/${encodeURIComponent(barcode)}.json`;
      const res = await fetch(url, {
        headers: { "User-Agent": this.userAgent },
        signal: controller.signal,
      }).finally(() => clearTimeout(timer));

      if (!res.ok) return null;
      const data = await res.json();
      if (data.status === 1 && data.product) {
        return this.parseOpenRegistryProduct(barcode, data.product, "Personal Care & Cosmetics");
      }
    } catch (err) {
      logger.debug("Open Beauty Facts lookup failed or timed out", { barcode, err: String(err) });
    }
    return null;
  }

  /**
   * Queries Open Products Facts public JSON API (general goods, water, detergents)
   */
  async queryOpenProductsFacts(barcode: string): Promise<DiscoveredProduct | null> {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      const url = `https://world.openproductsfacts.org/api/v0/product/${encodeURIComponent(barcode)}.json`;
      const res = await fetch(url, {
        headers: { "User-Agent": this.userAgent },
        signal: controller.signal,
      }).finally(() => clearTimeout(timer));

      if (!res.ok) return null;
      const data = await res.json();
      if (data.status === 1 && data.product) {
        return this.parseOpenRegistryProduct(barcode, data.product, "General Merchandise");
      }
    } catch (err) {
      logger.debug("Open Products Facts lookup failed or timed out", { barcode, err: String(err) });
    }
    return null;
  }

  /**
   * Parse product structure returned by Open * Facts family APIs
   */
  private parseOpenRegistryProduct(barcode: string, p: Record<string, any>, defaultCategory: string): DiscoveredProduct | null {
    const rawName = p.product_name || p.product_name_en || p.generic_name || p.generic_name_en;
    if (!rawName || typeof rawName !== "string" || !rawName.trim()) {
      return null;
    }

    const brand = p.brands ? String(p.brands).split(",")[0].trim() : undefined;
    let name = cleanCommercialProductName(rawName.trim(), brand);

    if (p.quantity && typeof p.quantity === "string" && !name.toLowerCase().includes(p.quantity.toLowerCase().trim())) {
      name = `${name} ${p.quantity.trim()}`;
    }

    let category = defaultCategory;
    if (p.categories && typeof p.categories === "string") {
      const catList = p.categories.split(",").map((c: string) => cleanCategoryName(c.trim())).filter(Boolean);
      if (catList.length > 0) {
        category = catList[catList.length - 1]; // Pick most specific category
      }
    }

    // Infer UOM from quantity
    let uom = "PCS";
    const qLower = (p.quantity || "").toLowerCase();
    if (qLower.includes("kg") || qLower.includes("kilo")) uom = "KG";
    else if (qLower.includes("gm") || qLower.includes("g") || qLower.includes("gram")) uom = "GM";
    else if (qLower.includes("ltr") || qLower.includes("l") || qLower.includes("litre")) uom = "LTR";
    else if (qLower.includes("ml")) uom = "PCS";
    else if (qLower.includes("pack")) uom = "PACK";

    return {
      barcode,
      name,
      brand,
      description: p.generic_name || p.generic_name_en || `${name} (${barcode})`,
      category,
      uom,
      confidence: "high",
      source: "registry",
    };
  }

  /**
   * Search Indian e-commerce / web via SearXNG or Gemini AI grounding
   */
  async queryWebAndExtract(barcode: string, prefixHint?: Gs1PrefixHint | null): Promise<DiscoveredProduct | null> {
    const searxngUrl = process.env.SEARXNG_URL?.trim();
    const snippets: string[] = [];

    // Query SearXNG if available
    if (searxngUrl) {
      try {
        const query = prefixHint
          ? `"${barcode}" ${prefixHint.brand || prefixHint.manufacturer}`
          : `"${barcode}" india product`;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 4000);
        const searchUrl = `${searxngUrl}/search?q=${encodeURIComponent(query)}&format=json&language=en`;
        const res = await fetch(searchUrl, {
          signal: controller.signal,
          headers: { "User-Agent": this.userAgent },
        }).finally(() => clearTimeout(timer));

        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.results)) {
            for (const r of data.results.slice(0, 5)) {
              if (r.title) snippets.push(`${r.title}: ${r.content || ""}`);
            }
          }
        }
      } catch (err) {
        logger.debug("SearXNG search error", { barcode, err: String(err) });
      }
    }

    // If in test environment without live AI key or quota exhausted, avoid long timeout
    if (process.env.VITEST || process.env.NODE_ENV === "test") {
      return null;
    }

    // If LLM configured, extract structured product attributes
    if (llmConfigured()) {
      try {
        const isIndian = barcode.startsWith("890");
        const hintText = prefixHint
          ? `\nVerified GS1 India Registry Context: Manufacturer: "${prefixHint.manufacturer}", Brand: "${prefixHint.brand}", Common Category: "${prefixHint.category}".`
          : isIndian
            ? "\nPrefix 890 indicates GS1 India (Indian FMCG, grocery, packaged food, personal care, or agricultural commodity)."
            : "";
        const snippetText = snippets.length > 0
          ? `\nWeb Search Snippets:\n${snippets.join("\n")}`
          : "";

        const prompt = `Identify the commercial retail product or commodity for barcode "${barcode}".${hintText}${snippetText}
If you recognize the specific product or variant, return its accurate commercial name, brand, standard pack/size, HSN code, and GST rate.
Respond strictly in JSON with these keys:
{
  "name": "Commercial Product Name with Pack/Size if applicable",
  "brand": "Brand Name or Manufacturer",
  "description": "Short product description",
  "category": "Broad category (e.g. Packaged Drinking Water, Bathing Soaps, Body Lotions & Skin Care, Instant Foods, Cold Drinks & Beverages)",
  "uom": "Standard Unit (e.g. KG, GM, LTR, PCS, PACK, BOX, BAG)",
  "hsnCode": "HSN Code (4 to 8 digits)",
  "gstRate": "GST Rate percentage (e.g. 0, 5, 12, 18, 28)"
}`;

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
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
              const brand = parsed.brand ? String(parsed.brand).trim() : prefixHint?.brand;
              return {
                barcode,
                name: cleanCommercialProductName(parsed.name.trim(), brand),
                brand,
                description: parsed.description ? String(parsed.description).trim() : undefined,
                category: parsed.category ? cleanCategoryName(String(parsed.category)) : prefixHint?.category,
                uom: parsed.uom ? String(parsed.uom).trim() : prefixHint?.defaultUom,
                hsnCode: parsed.hsnCode ? String(parsed.hsnCode).replace(/\D/g, "") : prefixHint?.defaultHsn,
                gstRate: parsed.gstRate !== undefined ? String(parsed.gstRate).replace("%", "").trim() : prefixHint?.defaultGst,
                confidence: snippets.length > 0 ? "high" : "medium",
                source: snippets.length > 0 ? "searxng" : "ai",
              };
            }
          }
        } finally {
          clearTimeout(timeout);
        }
      } catch (err) {
        logger.warn("AI barcode discovery error", { barcode, err: String(err) });
      }
    }

    return null;
  }

  /**
   * Self-learning write-through cache:
   * Saves discovered product metadata directly to PostgreSQL global_product_catalog.
   */
  async persistToGlobalCatalog(product: DiscoveredProduct): Promise<void> {
    try {
      await prisma.globalProductCatalog.upsert({
        where: { barcode: product.barcode },
        create: {
          barcode: product.barcode,
          name: product.name,
          brand: product.brand,
          description: product.description,
          category: product.category,
          uom: product.uom,
          hsnCode: product.hsnCode,
          gstRate: product.gstRate,
          source: product.source,
          confidence: product.confidence,
        },
        update: {
          name: product.name,
          brand: product.brand ?? undefined,
          description: product.description ?? undefined,
          category: product.category ?? undefined,
          uom: product.uom ?? undefined,
          hsnCode: product.hsnCode ?? undefined,
          gstRate: product.gstRate ?? undefined,
          source: product.source,
          confidence: product.confidence,
        },
      });
      logger.info("Persisted discovered product to global catalog", {
        barcode: product.barcode,
        name: product.name,
        source: product.source,
      });
    } catch (err) {
      logger.warn("Failed to persist product to global catalog", {
        barcode: product.barcode,
        err: String(err),
      });
    }
  }
}

export const barcodeDiscoveryService = new BarcodeDiscoveryService();
