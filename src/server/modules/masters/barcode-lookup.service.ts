import { prisma } from "@/server/db/client";
import { parseScannedBarcode, type ParsedIndustrialBarcode } from "@/lib/industrial-barcode";
import {
  barcodeDiscoveryService,
  cleanCategoryName,
  cleanCommercialProductName,
  type Gs1PrefixHint,
} from "./barcode-discovery.service";

export { cleanCategoryName, cleanCommercialProductName };

export interface IndustrialBarcodePayload {
  isComposite: boolean;
  gtin?: string;
  partNumber?: string;
  batchNumber?: string;
  expiryDate?: string;
  manufacturingDate?: string;
  serialNumber?: string;
  quantity?: number;
  weightKg?: number;
  sscc?: string;
}

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
  source: "local" | "registry" | "searxng" | "ai" | "inferred";
}

export interface BarcodeLookupResult {
  barcode: string;
  foundInDatabase: boolean;
  sku?: SkuLookupPayload;
  catalogDetails?: CatalogProductDetails;
  industrialData?: IndustrialBarcodePayload;
}

export type Gs1ManufacturerPrefix = Gs1PrefixHint;

/** High-speed in-memory L1 cache for instant barcode lookups (0.001ms) */
const lookupMemoryCache = new Map<string, BarcodeLookupResult>();

/** High-speed in-memory cache for GS1 manufacturer prefixes loaded from PostgreSQL */
let gs1PrefixCache: Map<string, Gs1ManufacturerPrefix> | null = null;
let gs1PrefixLoadingPromise: Promise<Map<string, Gs1ManufacturerPrefix>> | null = null;

export async function getGs1PrefixMap(): Promise<Map<string, Gs1ManufacturerPrefix>> {
  if (gs1PrefixCache) return gs1PrefixCache;
  if (!gs1PrefixLoadingPromise) {
    gs1PrefixLoadingPromise = (async () => {
      try {
        const rows = await prisma.gs1PrefixRegistry.findMany();
        const map = new Map<string, Gs1ManufacturerPrefix>();
        for (const row of rows) {
          map.set(row.prefix, {
            prefix: row.prefix,
            manufacturer: row.manufacturer,
            brand: row.brand,
            category: row.category,
            defaultUom: row.defaultUom,
            defaultHsn: row.defaultHsn ?? undefined,
            defaultGst: row.defaultGst ?? undefined,
          });
        }
        gs1PrefixCache = map;
        return map;
      } catch {
        return new Map<string, Gs1ManufacturerPrefix>();
      } finally {
        gs1PrefixLoadingPromise = null;
      }
    })();
  }
  return gs1PrefixLoadingPromise;
}

/** Invalidate memory caches when SKUs are modified */
export function invalidateBarcodeCache(barcode?: string): void {
  if (barcode) {
    lookupMemoryCache.delete(barcode.trim());
    barcodeDiscoveryService.prime(barcode.trim(), null);
  } else {
    lookupMemoryCache.clear();
  }
}

/** Match GS1 India Manufacturer Prefix (7-digit or 8-digit) from Database */
export async function lookupGs1Prefix(barcode: string): Promise<Gs1ManufacturerPrefix | null> {
  if (!barcode.startsWith("890")) return null;
  const map = await getGs1PrefixMap();
  const prefix7 = barcode.slice(0, 7);
  if (map.has(prefix7)) return map.get(prefix7)!;
  const prefix8 = barcode.slice(0, 8);
  if (map.has(prefix8)) return map.get(prefix8)!;
  return null;
}

/** Looks up barcode in internal database first, then central global catalog, open registries, and AI */
export async function lookupBarcodeDetails(rawBarcode: string): Promise<BarcodeLookupResult> {
  const parsed = parseScannedBarcode(rawBarcode);
  const barcode = (parsed.code || rawBarcode).trim();
  if (!barcode) {
    return { barcode: "", foundInDatabase: false };
  }

  // 1. Instant L1 memory cache hit (0.001 ms)
  const memoryCached = lookupMemoryCache.get(barcode);
  if (memoryCached) {
    if (parsed.isComposite) {
      return { ...memoryCached, industrialData: parsed };
    }
    return memoryCached;
  }

  // 2. Check local Margix master database (tenant's existing SKU)
  const existingSku = await prisma.sku.findFirst({
    where: {
      OR: [
        { barcode },
        { code: { equals: barcode, mode: "insensitive" } },
        ...(parsed.gtin ? [{ barcode: parsed.gtin }, { code: { equals: parsed.gtin, mode: "insensitive" as const } }] : []),
      ],
    },
    include: {
      category: { select: { id: true, name: true } },
      baseUom: { select: { id: true, code: true } },
    },
  });

  if (existingSku) {
    const res: BarcodeLookupResult = {
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
      industrialData: parsed.isComposite ? parsed : undefined,
    };
    lookupMemoryCache.set(barcode, res);
    return res;
  }

  // 3. Fetch master reference lists to match suggestions against actual system categories & UOMs
  const [categories, uoms, hsnCodes] = await Promise.all([
    prisma.category.findMany({ where: { isActive: true }, select: { id: true, name: true, hsnCode: true } }),
    prisma.uom.findMany({ select: { id: true, code: true, name: true } }),
    prisma.hsnCode.findMany({ where: { isActive: true }, select: { code: true, gstRate: true } }),
  ]);

  // 4. Check Central Global Product Catalog in PostgreSQL (stored in DB, sub-millisecond response)
  const dbCatalogHit = await prisma.globalProductCatalog.findUnique({
    where: { barcode },
  });

  if (dbCatalogHit) {
    const matchedCategoryId = resolveOrMatchCategory(dbCatalogHit.category ?? undefined, dbCatalogHit.hsnCode ?? undefined, categories);
    const matchedUomId = resolveUom(dbCatalogHit.uom ?? undefined, uoms);

    const res: BarcodeLookupResult = {
      barcode,
      foundInDatabase: false,
      catalogDetails: {
        name: dbCatalogHit.name,
        brand: dbCatalogHit.brand ?? undefined,
        description: dbCatalogHit.description ?? undefined,
        suggestedCategoryId: matchedCategoryId?.id,
        suggestedCategoryName: matchedCategoryId?.name || dbCatalogHit.category || undefined,
        suggestedBaseUomId: matchedUomId?.id,
        suggestedUomCode: matchedUomId?.code || dbCatalogHit.uom || undefined,
        suggestedHsnCode: dbCatalogHit.hsnCode ?? undefined,
        suggestedGstRate: dbCatalogHit.gstRate ?? undefined,
        confidence: (dbCatalogHit.confidence as "high" | "medium" | "low") || "high",
        source: "local",
      },
    };
    lookupMemoryCache.set(barcode, res);
    return res;
  }

  // 5. GS1 India Manufacturer Prefix check from Database
  const gs1PrefixInfo = await lookupGs1Prefix(barcode);

  // 6. High-Speed Open-Source Multi-Tier Discovery Service (parallel race)
  const discovered = await barcodeDiscoveryService.discover(barcode, gs1PrefixInfo);

  let productName = discovered?.name;
  let brand = discovered?.brand || gs1PrefixInfo?.brand;
  let description = discovered?.description;
  let suggestedCategoryName = discovered?.category || gs1PrefixInfo?.category;
  let suggestedUomCode = discovered?.uom || gs1PrefixInfo?.defaultUom;
  let suggestedHsn = discovered?.hsnCode || gs1PrefixInfo?.defaultHsn;
  let suggestedGst = discovered?.gstRate || gs1PrefixInfo?.defaultGst;
  let confidence: "high" | "medium" | "low" = discovered?.confidence || (gs1PrefixInfo ? "medium" : "low");
  let source: "registry" | "searxng" | "ai" | "inferred" = discovered?.source || "inferred";

  // 7. Inferred fallback if uncataloged in any registry
  if (!productName) {
    if (gs1PrefixInfo) {
      const b = gs1PrefixInfo.brand;
      const cat = gs1PrefixInfo.category;
      let inferredName = `${b} Product (${barcode.slice(-6)})`;
      if (cat.includes("Water")) {
        inferredName = `${b} Packaged Drinking Water (${barcode.slice(-6)})`;
      } else if (cat.includes("Bathing") || cat.includes("Soap")) {
        inferredName = `${b} Bathing Soap (${barcode.slice(-6)})`;
      } else if (cat.includes("Skin Care") || cat.includes("Lotion")) {
        inferredName = `${b} Body Lotion / Skin Cream (${barcode.slice(-6)})`;
      } else if (cat.includes("Hair Care") || cat.includes("Shampoo")) {
        inferredName = `${b} Shampoo / Hair Care (${barcode.slice(-6)})`;
      } else if (cat.includes("Beverages") || cat.includes("Drinks")) {
        inferredName = `${b} Beverage / Cold Drink (${barcode.slice(-6)})`;
      } else if (cat.includes("Snacks")) {
        inferredName = `${b} Packaged Snacks (${barcode.slice(-6)})`;
      }
      productName = inferredName;
      description = `${gs1PrefixInfo.manufacturer} product with barcode ${barcode}`;
      suggestedCategoryName = gs1PrefixInfo.category;
      suggestedUomCode = gs1PrefixInfo.defaultUom;
      suggestedHsn = gs1PrefixInfo.defaultHsn;
      suggestedGst = gs1PrefixInfo.defaultGst;
      confidence = "medium";
      source = "inferred";
    } else if (barcode.startsWith("890")) {
      productName = `GS1 India Product (${barcode.slice(-6)})`;
      description = `Indian commercial product with barcode ${barcode}`;
      suggestedCategoryName = "General";
      suggestedUomCode = "PCS";
      confidence = "low";
      source = "inferred";
    } else {
      productName = `Scanned Item (${barcode})`;
      description = `Product identified by barcode ${barcode}`;
      suggestedUomCode = "PCS";
      confidence = "low";
      source = "inferred";
    }

    // Persist inferred item to global catalog so we never spend resources discovering it again
    if (productName) {
      barcodeDiscoveryService.persistToGlobalCatalog({
        barcode,
        name: productName,
        brand,
        description,
        category: suggestedCategoryName,
        uom: suggestedUomCode,
        hsnCode: suggestedHsn,
        gstRate: suggestedGst,
        confidence,
        source: "inferred",
      }).catch(() => {});
    }
  }

  // 8. Match or Auto-Create Category in Database
  let matchedCategory = resolveOrMatchCategory(suggestedCategoryName, suggestedHsn, categories);

  if (!matchedCategory && suggestedCategoryName && suggestedCategoryName.trim()) {
    const formattedCatName = cleanCategoryName(suggestedCategoryName);
    const validCategoryHsn = suggestedHsn && hsnCodes.some((h) => h.code === suggestedHsn) ? suggestedHsn : null;
    try {
      const createdCategory = await prisma.category.create({
        data: {
          name: formattedCatName,
          isActive: true,
          hsnCode: validCategoryHsn,
        },
      });
      matchedCategory = { id: createdCategory.id, name: createdCategory.name };
    } catch {
      const found = await prisma.category.findFirst({
        where: { name: { equals: formattedCatName, mode: "insensitive" } },
      });
      if (found) {
        matchedCategory = { id: found.id, name: found.name };
      } else if (categories.length > 0) {
        matchedCategory = { id: categories[0].id, name: categories[0].name };
      }
    }
  } else if (!matchedCategory && categories.length > 0) {
    matchedCategory = { id: categories[0].id, name: categories[0].name };
  }

  // 9. Match UOM against existing DB UOMs
  const matchedUom = resolveUom(suggestedUomCode, uoms);

  // 10. Verify or look up GST rate from HSN master if HSN code is present
  if (suggestedHsn && hsnCodes.length > 0) {
    const hsnCodeStr = suggestedHsn;
    const exactHsn =
      hsnCodes.find((h) => h.code === hsnCodeStr) ||
      hsnCodes.find((h) => h.code.startsWith(hsnCodeStr.slice(0, 4)));
    if (exactHsn) {
      suggestedHsn = exactHsn.code;
      suggestedGst = exactHsn.gstRate.toString();
    }
  }

  const result: BarcodeLookupResult = {
    barcode,
    foundInDatabase: false,
    catalogDetails: {
      name: productName,
      brand,
      description,
      suggestedCategoryId: matchedCategory?.id,
      suggestedCategoryName: matchedCategory?.name || suggestedCategoryName,
      suggestedBaseUomId: matchedUom?.id,
      suggestedUomCode: matchedUom?.code || suggestedUomCode,
      suggestedHsnCode: suggestedHsn,
      suggestedGstRate: suggestedGst,
      confidence,
      source,
    },
  };

  lookupMemoryCache.set(barcode, result);
  return result;
}

export function resolveOrMatchCategory(
  suggestedName: string | undefined,
  suggestedHsn: string | undefined,
  categories: Array<{ id: string; name: string; hsnCode: string | null }>,
): { id: string; name: string } | null {
  if (!suggestedName) return null;
  const sCat = suggestedName.toLowerCase().trim();
  const matched = categories.find(
    (c) =>
      c.name.toLowerCase() === sCat ||
      sCat.includes(c.name.toLowerCase()) ||
      c.name.toLowerCase().includes(sCat),
  );
  if (matched) return { id: matched.id, name: matched.name };
  return null;
}

export function resolveUom(
  suggestedCode: string | undefined,
  uoms: Array<{ id: string; code: string; name: string }>,
): { id: string; code: string } | null {
  if (suggestedCode && uoms.length > 0) {
    const norm = suggestedCode.toUpperCase().replace(/\./g, "");
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
      PACKET: "PACK",
      PACKETS: "PACK",
      PKT: "PACK",
      BOTTLE: "PCS",
      TUBE: "PCS",
      JAR: "PCS",
      CAN: "PCS",
    };
    const targetCode = aliasMap[norm] || norm;
    const found =
      uoms.find((u) => u.code.toUpperCase() === targetCode) ||
      uoms.find((u) => u.name.toUpperCase().includes(targetCode));
    if (found) {
      return { id: found.id, code: found.code };
    }
  }

  if (uoms.length > 0) {
    const def =
      uoms.find((u) => u.code.toUpperCase() === "PCS" || u.code.toUpperCase() === "PACK") ||
      uoms[0];
    return { id: def.id, code: def.code };
  }

  return null;
}
