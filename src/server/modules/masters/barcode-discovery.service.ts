import dns from "node:dns";
if (typeof dns.setDefaultResultOrder === "function") {
  dns.setDefaultResultOrder("ipv4first");
}
import { prisma } from "@/server/db/client";
import { executeLlmChat, llmConfigured } from "@/server/modules/copilot/llm";
import { suggestHsnCodes } from "@/server/modules/hsn/hsn.queries";
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
 * High-Speed Open-Source Barcode Discovery Service
 * Queries open registries (Open Food Facts, Open Beauty Facts, Open Products Facts)
 * IN PARALLEL with micro-timeouts, caches every result in memory and PostgreSQL,
 * and eliminates duplicate network requests.
 */
export class BarcodeDiscoveryService {
  private userAgent = "MargixIMS/1.0 (https://ims.margixindia.com; inventory@margixindia.com)";
  private l1Cache = new Map<string, DiscoveredProduct | null>();

  /**
   * Primary discovery coordinator:
   * 1. Check L1 Memory Cache (0.001ms)
   * 2. Query open registries (Food, Beauty, Products) IN PARALLEL with 1200ms timeout
   * 3. Fast-fallback to GS1 prefix routing if unlisted
   * 4. Write-through to PostgreSQL and L1 Cache permanently
   */
  async discover(barcode: string, prefixHint?: Gs1PrefixHint | null): Promise<DiscoveredProduct | null> {
    const cleanCode = barcode.trim();
    if (!cleanCode) return null;

    // 1. Instant L1 memory cache hit
    if (this.l1Cache.has(cleanCode)) {
      return this.l1Cache.get(cleanCode) || null;
    }

    // 2. Query Open Registries (Food, Beauty, Products, UPCitemdb) concurrently in parallel
    const [foodRes, beautyRes, productRes, upcRes] = await Promise.allSettled([
      this.queryOpenFoodFacts(cleanCode, 2000),
      this.queryOpenBeautyFacts(cleanCode, 2000),
      this.queryOpenProductsFacts(cleanCode, 2000),
      this.queryUpcItemDb(cleanCode, 2000),
    ]);

    const found =
      (foodRes.status === "fulfilled" && foodRes.value) ||
      (beautyRes.status === "fulfilled" && beautyRes.value) ||
      (productRes.status === "fulfilled" && productRes.value) ||
      (upcRes.status === "fulfilled" && upcRes.value) ||
      null;

    if (found) {
      if (!found.hsnCode || !found.gstRate) {
        try {
          const suggestions = await suggestHsnCodes({ name: found.name, description: found.description }, 1);
          if (suggestions.length > 0) {
            found.hsnCode = suggestions[0].code;
            found.gstRate = suggestions[0].gstRate;
          }
        } catch {
          // Ignore suggestion error
        }
      }
      this.l1Cache.set(cleanCode, found);
      await this.persistToGlobalCatalog(found);
      return found;
    }

    // 3. Try Live Web Search via SearXNG + Deep AI Extraction (15s timeout)
    const web = await this.queryWebAndExtract(cleanCode, prefixHint);
    if (web) {
      if (!web.hsnCode || !web.gstRate) {
        try {
          const suggestions = await suggestHsnCodes({ name: web.name, description: web.description }, 1);
          if (suggestions.length > 0) {
            web.hsnCode = suggestions[0].code;
            web.gstRate = suggestions[0].gstRate;
          }
        } catch {
          // Ignore suggestion error
        }
      }
      this.l1Cache.set(cleanCode, web);
      await this.persistToGlobalCatalog(web);
      return web;
    }

    this.l1Cache.set(cleanCode, null);
    return null;
  }

  /**
   * Invalidate or prime cache
   */
  prime(barcode: string, product: DiscoveredProduct | null): void {
    this.l1Cache.set(barcode.trim(), product);
  }

  /**
   * Queries Open Food Facts public JSON API
   */
  async queryOpenFoodFacts(barcode: string, timeoutMs = 1400): Promise<DiscoveredProduct | null> {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
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
  async queryOpenBeautyFacts(barcode: string, timeoutMs = 1400): Promise<DiscoveredProduct | null> {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
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
  async queryOpenProductsFacts(barcode: string, timeoutMs = 1400): Promise<DiscoveredProduct | null> {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
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
   * Queries UPCitemdb public trial JSON API (global consumer & hardware items)
   */
  async queryUpcItemDb(barcode: string, timeoutMs = 2000): Promise<DiscoveredProduct | null> {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const url = `https://api.upcitemdb.com/prod/trial/lookup?upc=${encodeURIComponent(barcode)}`;
      const res = await fetch(url, {
        headers: { "User-Agent": this.userAgent, Accept: "application/json" },
        signal: controller.signal,
      }).finally(() => clearTimeout(timer));

      if (!res.ok) return null;
      const data = await res.json();
      if (data.code === "OK" && Array.isArray(data.items) && data.items.length > 0) {
        const item = data.items[0];
        const rawName = item.title;
        if (!rawName || typeof rawName !== "string" || !rawName.trim()) return null;
        const brand = item.brand ? String(item.brand).trim() : undefined;
        const name = cleanCommercialProductName(rawName.trim(), brand);
        const category = item.category ? cleanCategoryName(String(item.category)) : "General Merchandise";
        return {
          barcode,
          name,
          brand,
          description: item.description ? String(item.description).slice(0, 500) : `${name} (${barcode})`,
          category,
          uom: "PCS",
          confidence: "high",
          source: "registry",
        };
      }
    } catch (err) {
      logger.debug("UPCitemdb lookup failed or timed out", { barcode, err: String(err) });
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
        category = catList[catList.length - 1];
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
        const timer = setTimeout(() => controller.abort(), 1800);
        const searchUrl = `${searxngUrl}/search?q=${encodeURIComponent(query)}&format=json&language=en`;
        const res = await fetch(searchUrl, {
          signal: controller.signal,
          headers: { "User-Agent": this.userAgent },
        }).finally(() => clearTimeout(timer));

        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.results)) {
            for (const r of data.results.slice(0, 4)) {
              if (r.title) snippets.push(`${r.title}: ${r.content || ""}`);
            }
          }
        }
      } catch (err) {
        logger.debug("SearXNG search error", { barcode, err: String(err) });
      }
    }

    // If in test environment, skip external LLM to guarantee deterministic sub-second tests
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

        const prompt = `Identify the product, equipment, component, or commodity for barcode / part number "${barcode}".${hintText}${snippetText}
This can be any product across all consumer and industrial sectors:
- Industrial equipment, bearings, motors, pumps, valves, hydraulic/pneumatic parts, fasteners, hardware (e.g. SKF, FAG, Siemens, Schneider Electric, ABB, L&T, Parker, Unbrako)
- Automotive & commercial vehicle spare parts, filters, brake pads, spark plugs, sensors (e.g. Bosch, NGK, Gabriel, Mahle, Valeo, TVS)
- Electrical switchgear, MCBs, contactors, cables, industrial wiring (e.g. Polycab, Havells, Legrand)
- Electronics, semiconductors, passives, microcontrollers, ICs, modules
- Construction materials, cement, TMT steel, pipes, fittings (e.g. UltraTech, Tata Tiscon, Astral, Supreme)
- FMCG, grocery, packaged foods, beverages, personal care, cosmetics, soaps, lotions
- Pharmaceuticals, formulations, medical devices, health supplies
- Chemicals, industrial lubricants, greases, adhesives, paints (e.g. Castrol, Loctite, Asian Paints)
- Raw materials, metals, plastics, textiles

Respond strictly in JSON with these keys:
{
  "name": "Accurate Commercial/Industrial Name with key specifications/dimensions/size if applicable",
  "brand": "Manufacturer or Brand Name",
  "description": "Short product description with technical specifications",
  "category": "Broad Category (e.g. Industrial Bearings, Electrical Switchgear, Automotive Spares, Fasteners & Hardware, Electronics & Semis, Packaged Goods, Personal Care, Construction Materials, Pharmaceuticals)",
  "uom": "Standard Unit of Measure (e.g. PCS, NOS, SET, MTR, KG, LTR, BOX, BAG, PAIR, ROLL, CAN, DRUM, TON)",
  "hsnCode": "Standard Indian GST HSN Code (4 to 8 digits, e.g. 8482 for bearings, 8536 for switchgear, 7318 for fasteners, 8708 for auto parts, 3004 for pharma, 2201 for water)",
  "gstRate": "Standard GST Rate percentage in India (e.g. 0, 5, 12, 18, 28)"
}`;

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);
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
    // Never persist dummy inferred placeholder items to global database catalog
    if (
      product.source === "inferred" ||
      product.name.startsWith("Scanned Item") ||
      product.name.includes("Product (000000)")
    ) {
      return;
    }
    try {
      this.l1Cache.set(product.barcode, product);
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
