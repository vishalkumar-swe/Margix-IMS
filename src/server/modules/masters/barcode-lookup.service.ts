import { prisma } from "@/server/db/client";
import {
  barcodeDiscoveryService,
  cleanCategoryName,
  cleanCommercialProductName,
  type Gs1PrefixHint,
} from "./barcode-discovery.service";

export { cleanCategoryName, cleanCommercialProductName };

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
}

export type Gs1ManufacturerPrefix = Gs1PrefixHint;

/** Comprehensive GS1 India (Prefix 890) Manufacturer Prefix Registry */
const GS1_INDIA_PREFIX_MAP: Record<string, Gs1ManufacturerPrefix> = {
  // 7-digit prefixes
  "8901030": {
    prefix: "8901030",
    manufacturer: "Hindustan Unilever Limited",
    brand: "HUL",
    category: "Personal Care & Home Care",
    defaultHsn: "34011110",
    defaultGst: "18",
    defaultUom: "PCS",
  },
  "8901058": {
    prefix: "8901058",
    manufacturer: "Nestlé India Limited",
    brand: "Nestlé",
    category: "Packaged Foods & Beverages",
    defaultHsn: "19023010",
    defaultGst: "12",
    defaultUom: "PACK",
  },
  "8901052": {
    prefix: "8901052",
    manufacturer: "Tata Consumer Products Limited",
    brand: "Tata",
    category: "Grocery & Beverages",
    defaultHsn: "09024020",
    defaultGst: "5",
    defaultUom: "PACK",
  },
  "8901719": {
    prefix: "8901719",
    manufacturer: "Parle Products Private Limited",
    brand: "Parle",
    category: "Bakery & Biscuits",
    defaultHsn: "19053100",
    defaultGst: "18",
    defaultUom: "PACK",
  },
  "8901063": {
    prefix: "8901063",
    manufacturer: "Britannia Industries Limited",
    brand: "Britannia",
    category: "Bakery & Biscuits",
    defaultHsn: "19053100",
    defaultGst: "18",
    defaultUom: "PACK",
  },
  "8901499": {
    prefix: "8901499",
    manufacturer: "ITC Limited",
    brand: "ITC",
    category: "Packaged Goods & Staples",
    defaultHsn: "11010000",
    defaultGst: "5",
    defaultUom: "PACK",
  },
  "8906001": {
    prefix: "8906001",
    manufacturer: "Gujarat Co-operative Milk Marketing Federation (Amul)",
    brand: "Amul",
    category: "Dairy Products",
    defaultHsn: "04051000",
    defaultGst: "12",
    defaultUom: "PACK",
  },
  "8906007": {
    prefix: "8906007",
    manufacturer: "Amul Dairy Products (GCMMF)",
    brand: "Amul",
    category: "Dairy Products",
    defaultHsn: "04011000",
    defaultGst: "5",
    defaultUom: "PCS",
  },
  "8906010": {
    prefix: "8906010",
    manufacturer: "Adani Wilmar Limited",
    brand: "Fortune",
    category: "Edible Oils & Staples",
    defaultHsn: "15121910",
    defaultGst: "5",
    defaultUom: "PACK",
  },
  "8906020": {
    prefix: "8906020",
    manufacturer: "KRBL Limited",
    brand: "India Gate",
    category: "Grains & Rice",
    defaultHsn: "10063020",
    defaultGst: "5",
    defaultUom: "BAG",
  },
  "8906079": {
    prefix: "8906079",
    manufacturer: "LT Foods Limited",
    brand: "Daawat",
    category: "Grains & Rice",
    defaultHsn: "10063020",
    defaultGst: "5",
    defaultUom: "BAG",
  },
  "8901262": {
    prefix: "8901262",
    manufacturer: "Marico Limited",
    brand: "Marico",
    category: "Personal Care & Edible Oils",
    defaultHsn: "15131900",
    defaultGst: "5",
    defaultUom: "PCS",
  },
  "8901207": {
    prefix: "8901207",
    manufacturer: "Dabur India Limited",
    brand: "Dabur",
    category: "Healthcare & Ayurvedic",
    defaultHsn: "30049011",
    defaultGst: "12",
    defaultUom: "PCS",
  },
  "8902579": {
    prefix: "8902579",
    manufacturer: "Patanjali Ayurved Limited",
    brand: "Patanjali",
    category: "Ayurvedic & Staples",
    defaultHsn: "04059020",
    defaultGst: "12",
    defaultUom: "PCS",
  },
  "8901725": {
    prefix: "8901725",
    manufacturer: "Haldiram Foods International",
    brand: "Haldiram's",
    category: "Snacks & Sweets",
    defaultHsn: "21069099",
    defaultGst: "12",
    defaultUom: "PACK",
  },
  "8906005": {
    prefix: "8906005",
    manufacturer: "Everest Food Products Private Limited",
    brand: "Everest",
    category: "Spices & Seasonings",
    defaultHsn: "09109100",
    defaultGst: "5",
    defaultUom: "PACK",
  },
  "8901387": {
    prefix: "8901387",
    manufacturer: "Mahashian Di Hatti Private Limited (MDH)",
    brand: "MDH",
    category: "Spices & Seasonings",
    defaultHsn: "09109100",
    defaultGst: "5",
    defaultUom: "PACK",
  },
  "8906014": {
    prefix: "8906014",
    manufacturer: "Dharampal Satyapal Limited (DS Group)",
    brand: "Catch",
    category: "Spices & Seasonings",
    defaultHsn: "25010010",
    defaultGst: "5",
    defaultUom: "PCS",
  },
  "8901012": {
    prefix: "8901012",
    manufacturer: "Colgate-Palmolive (India) Limited",
    brand: "Colgate",
    category: "Personal Care & Oral Care",
    defaultHsn: "33061020",
    defaultGst: "18",
    defaultUom: "PCS",
  },
  "8901023": {
    prefix: "8901023",
    manufacturer: "Reckitt Benckiser (India) Limited",
    brand: "Dettol / Reckitt",
    category: "Hygiene & Home Care",
    defaultHsn: "34011110",
    defaultGst: "18",
    defaultUom: "PCS",
  },
  "8901088": {
    prefix: "8901088",
    manufacturer: "Procter & Gamble Home Products",
    brand: "P&G",
    category: "Home & Personal Care",
    defaultHsn: "34029099",
    defaultGst: "18",
    defaultUom: "PACK",
  },
  "8901233": {
    prefix: "8901233",
    manufacturer: "Mondelez India Foods Private Limited",
    brand: "Cadbury",
    category: "Confectionery & Chocolates",
    defaultHsn: "18063200",
    defaultGst: "18",
    defaultUom: "PCS",
  },
  "8901764": {
    prefix: "8901764",
    manufacturer: "Godrej Consumer Products Limited",
    brand: "Godrej",
    category: "Home & Personal Care",
    defaultHsn: "38089191",
    defaultGst: "18",
    defaultUom: "PCS",
  },
  "8901314": {
    prefix: "8901314",
    manufacturer: "Emami Limited",
    brand: "Emami",
    category: "Personal Care & Healthcare",
    defaultHsn: "30049089",
    defaultGst: "12",
    defaultUom: "PCS",
  },
  "8904004": {
    prefix: "8904004",
    manufacturer: "Himalaya Wellness Company",
    brand: "Himalaya",
    category: "Personal Care & Wellness",
    defaultHsn: "34013000",
    defaultGst: "18",
    defaultUom: "PCS",
  },
  "8901022": {
    prefix: "8901022",
    manufacturer: "Wipro Enterprises Private Limited",
    brand: "Wipro",
    category: "Personal Care & Soap",
    defaultHsn: "34011110",
    defaultGst: "18",
    defaultUom: "PCS",
  },
  "8901015": {
    prefix: "8901015",
    manufacturer: "Pidilite Industries Limited",
    brand: "Pidilite",
    category: "Stationery & Adhesives",
    defaultHsn: "35061000",
    defaultGst: "18",
    defaultUom: "PCS",
  },
  "8901138": {
    prefix: "8901138",
    manufacturer: "PepsiCo India Holdings Private Limited",
    brand: "PepsiCo",
    category: "Packaged Snacks & Beverages",
    defaultHsn: "19059040",
    defaultGst: "12",
    defaultUom: "PACK",
  },
  "8901491": {
    prefix: "8901491",
    manufacturer: "Coca-Cola India Private Limited",
    brand: "Coca-Cola",
    category: "Beverages",
    defaultHsn: "22021010",
    defaultGst: "28",
    defaultUom: "PCS",
  },
  "8901648": {
    prefix: "8901648",
    manufacturer: "Mother Dairy Fruit & Vegetable",
    brand: "Mother Dairy",
    category: "Dairy Products",
    defaultHsn: "04012000",
    defaultGst: "5",
    defaultUom: "PACK",
  },
  "8901844": {
    prefix: "8901844",
    manufacturer: "Bikaji Foods International Limited",
    brand: "Bikaji",
    category: "Packaged Snacks",
    defaultHsn: "21069099",
    defaultGst: "12",
    defaultUom: "PACK",
  },
  "8901512": {
    prefix: "8901512",
    manufacturer: "Bikanervala Foods Private Limited",
    brand: "Bikano",
    category: "Packaged Snacks",
    defaultHsn: "21069099",
    defaultGst: "12",
    defaultUom: "PACK",
  },
  "8902080": {
    prefix: "8902080",
    manufacturer: "MTR Foods Private Limited",
    brand: "MTR",
    category: "Instant Foods & Packaged Goods",
    defaultHsn: "21069099",
    defaultGst: "12",
    defaultUom: "PACK",
  },
  "8901582": {
    prefix: "8901582",
    manufacturer: "Balaji Wafers Private Limited",
    brand: "Balaji",
    category: "Packaged Snacks",
    defaultHsn: "19059040",
    defaultGst: "12",
    defaultUom: "PACK",
  },
  "8904153": {
    prefix: "8904153",
    manufacturer: "Hector Beverages Private Limited",
    brand: "Paper Boat",
    category: "Beverages",
    defaultHsn: "22029920",
    defaultGst: "12",
    defaultUom: "PCS",
  },
  "8906018": {
    prefix: "8906018",
    manufacturer: "Hamdard Laboratories India",
    brand: "Hamdard",
    category: "Beverages & Ayurvedic",
    defaultHsn: "21069019",
    defaultGst: "18",
    defaultUom: "PCS",
  },
  "8901034": {
    prefix: "8901034",
    manufacturer: "Asian Paints Limited",
    brand: "Asian Paints",
    category: "Paints & Coatings",
    defaultHsn: "32091090",
    defaultGst: "18",
    defaultUom: "CAN",
  },
  "8901525": {
    prefix: "8901525",
    manufacturer: "Raymond Limited",
    brand: "Raymond",
    category: "Textiles & Apparel",
    defaultHsn: "55151100",
    defaultGst: "5",
    defaultUom: "MTR",
  },
  "8901067": {
    prefix: "8901067",
    manufacturer: "Bata India Limited",
    brand: "Bata",
    category: "Footwear",
    defaultHsn: "64041990",
    defaultGst: "12",
    defaultUom: "PAIR",
  },
  "8906003": {
    prefix: "8906003",
    manufacturer: "Bisleri International Private Limited",
    brand: "Bisleri",
    category: "Packaged Drinking Water & Beverages",
    defaultHsn: "22011010",
    defaultGst: "18",
    defaultUom: "PCS",
  },
  "8901416": {
    prefix: "8901416",
    manufacturer: "Karnataka Soaps and Detergents Limited",
    brand: "Mysore Sandal",
    category: "Personal Care & Bathing",
    defaultHsn: "34011110",
    defaultGst: "18",
    defaultUom: "PCS",
  },
  "8904018": {
    prefix: "8904018",
    manufacturer: "Cholayil Private Limited",
    brand: "Medimix",
    category: "Personal Care & Bathing",
    defaultHsn: "34011110",
    defaultGst: "18",
    defaultUom: "PCS",
  },
  "8908006": {
    prefix: "8908006",
    manufacturer: "Cholayil Private Limited",
    brand: "Medimix",
    category: "Personal Care & Bathing",
    defaultHsn: "34011110",
    defaultGst: "18",
    defaultUom: "PCS",
  },
  "8904052": {
    prefix: "8904052",
    manufacturer: "Nivea India Private Limited",
    brand: "Nivea",
    category: "Personal Care & Skin Care",
    defaultHsn: "33049990",
    defaultGst: "18",
    defaultUom: "PCS",
  },
  "8901323": {
    prefix: "8901323",
    manufacturer: "GD Pharmaceuticals Private Limited",
    brand: "Boroline",
    category: "Personal Care & Skin Care",
    defaultHsn: "30049089",
    defaultGst: "12",
    defaultUom: "PCS",
  },
  "8901288": {
    prefix: "8901288",
    manufacturer: "Vicco Laboratories",
    brand: "Vicco",
    category: "Personal Care & Skin Care",
    defaultHsn: "30049011",
    defaultGst: "12",
    defaultUom: "PCS",
  },
  "89060074": {
    prefix: "89060074",
    manufacturer: "RSH Global Private Limited (Joy Personal Care)",
    brand: "Joy",
    category: "Personal Care & Skin Care",
    defaultHsn: "33049990",
    defaultGst: "18",
    defaultUom: "PCS",
  },
  "8901526": {
    prefix: "8901526",
    manufacturer: "L'Oréal India Private Limited",
    brand: "L'Oréal",
    category: "Personal Care & Hair Care",
    defaultHsn: "33051090",
    defaultGst: "18",
    defaultUom: "PCS",
  },
  "8908000": {
    prefix: "8908000",
    manufacturer: "Indian Railway Catering and Tourism Corporation (IRCTC)",
    brand: "Rail Neer",
    category: "Packaged Drinking Water & Beverages",
    defaultHsn: "22011010",
    defaultGst: "18",
    defaultUom: "PCS",
  },
};

/** Match GS1 India Manufacturer Prefix (7-digit or 8-digit) */
export function lookupGs1Prefix(barcode: string): Gs1ManufacturerPrefix | null {
  if (!barcode.startsWith("890")) return null;
  const prefix7 = barcode.slice(0, 7);
  if (GS1_INDIA_PREFIX_MAP[prefix7]) {
    return GS1_INDIA_PREFIX_MAP[prefix7];
  }
  const prefix8 = barcode.slice(0, 8);
  if (GS1_INDIA_PREFIX_MAP[prefix8]) {
    return GS1_INDIA_PREFIX_MAP[prefix8];
  }
  return null;
}

/** Looks up barcode in internal database first, then central global catalog, open registries, and AI */
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

  // 3. Check Central Global Product Catalog in PostgreSQL (stored in DB, sub-millisecond response)
  const dbCatalogHit = await prisma.globalProductCatalog.findUnique({
    where: { barcode },
  });

  if (dbCatalogHit) {
    const matchedCategoryId = resolveOrMatchCategory(dbCatalogHit.category ?? undefined, dbCatalogHit.hsnCode ?? undefined, categories);
    const matchedUomId = resolveUom(dbCatalogHit.uom ?? undefined, uoms);

    return {
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
  }

  // 4. GS1 India Manufacturer Prefix check
  const gs1PrefixInfo = lookupGs1Prefix(barcode);

  // 5. Open-Source Multi-Tier Discovery Service (Open Food Facts, Open Beauty Facts, Open Products Facts, SearXNG + AI)
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

  // 6. Inferred fallback if uncataloged in any registry
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
  }

  // 7. Match or Auto-Create Category in Database
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
      // Handle collision or concurrent creation
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

  // 8. Match UOM against existing DB UOMs
  const matchedUom = resolveUom(suggestedUomCode, uoms);

  // 9. Verify or look up GST rate from HSN master if HSN code is present
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

  return {
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
