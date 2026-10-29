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

interface CuratedProductRecord {
  name: string;
  brand: string;
  description: string;
  category: string;
  uom: string;
  hsnCode: string;
  gstRate: string;
}

/** Top Curated FMCG Products in India for Instant Zero-Latency Offline Recognition */
const CURATED_GTIN_CATALOG: Record<string, CuratedProductRecord> = {
  // Nestlé
  "8901058862492": {
    name: "Maggi 2-Minute Masala Instant Noodles 70g",
    brand: "Nestlé",
    description: "Nestlé Maggi 2-Minute Masala Noodles single pack (70g)",
    category: "Instant Foods & Packaged Goods",
    uom: "PACK",
    hsnCode: "19023010",
    gstRate: "12",
  },
  "8901058852899": {
    name: "Maggi 2-Minute Masala Instant Noodles 140g",
    brand: "Nestlé",
    description: "Nestlé Maggi 2-Minute Masala Noodles double pack (140g)",
    category: "Instant Foods & Packaged Goods",
    uom: "PACK",
    hsnCode: "19023010",
    gstRate: "12",
  },
  "8901058853742": {
    name: "Maggi 2-Minute Masala Instant Noodles 280g 4-Pack",
    brand: "Nestlé",
    description: "Nestlé Maggi 2-Minute Masala Instant Noodles 4-Pack (280g)",
    category: "Instant Foods & Packaged Goods",
    uom: "PACK",
    hsnCode: "19023010",
    gstRate: "12",
  },
  "8901058849769": {
    name: "Nescafé Classic Instant Coffee 50g Glass Jar",
    brand: "Nestlé",
    description: "Nescafé Classic 100% Pure Instant Coffee glass jar (50g)",
    category: "Beverages",
    uom: "PCS",
    hsnCode: "21011110",
    gstRate: "18",
  },
  "8901058853100": {
    name: "Nestlé KitKat 4-Finger Crisp Wafer Chocolate 38.5g",
    brand: "Nestlé",
    description: "Nestlé KitKat 4 Finger Chocolate Bar (38.5g)",
    category: "Confectionery & Chocolates",
    uom: "PCS",
    hsnCode: "18063200",
    gstRate: "18",
  },
  "8901058838527": {
    name: "Nestlé Everyday Dairy Whitener 1kg",
    brand: "Nestlé",
    description: "Nestlé Everyday Dairy Whitener Milk Powder (1kg)",
    category: "Dairy Products",
    uom: "PACK",
    hsnCode: "04029990",
    gstRate: "5",
  },

  // Tata Consumer Products
  "8901052000516": {
    name: "Tata Salt Vacuum Evaporated Iodised Salt 1kg",
    brand: "Tata Salt",
    description: "Tata Salt Iodised Vacuum Evaporated Cooking Salt pouch (1kg)",
    category: "Spices & Seasonings",
    uom: "PACK",
    hsnCode: "25010010",
    gstRate: "0",
  },
  "8901052000523": {
    name: "Tata Salt Lite Low Sodium Iodised Salt 1kg",
    brand: "Tata Salt",
    description: "Tata Salt Lite 15% Low Sodium Iodised Salt (1kg)",
    category: "Spices & Seasonings",
    uom: "PACK",
    hsnCode: "25010010",
    gstRate: "0",
  },
  "8901052002114": {
    name: "Tata Tea Premium Desh Ki Chai 500g",
    brand: "Tata Tea",
    description: "Tata Tea Premium Desh Ki Chai leaf & dust blend (500g)",
    category: "Beverages",
    uom: "PACK",
    hsnCode: "09024020",
    gstRate: "5",
  },
  "8901052002107": {
    name: "Tata Tea Premium Desh Ki Chai 1kg",
    brand: "Tata Tea",
    description: "Tata Tea Premium Desh Ki Chai packet (1kg)",
    category: "Beverages",
    uom: "PACK",
    hsnCode: "09024020",
    gstRate: "5",
  },
  "8901052026134": {
    name: "Tata Tea Gold 500g",
    brand: "Tata Tea",
    description: "Tata Tea Gold Rich Assam Tea Leaves with Long Leaves (500g)",
    category: "Beverages",
    uom: "PACK",
    hsnCode: "09024020",
    gstRate: "5",
  },
  "8901052011703": {
    name: "Tata Sampann Unpolished Toor Dal 1kg",
    brand: "Tata Sampann",
    description: "Tata Sampann High Protein Unpolished Tur / Arhar Dal (1kg)",
    category: "Grains & Pulses",
    uom: "PACK",
    hsnCode: "07136000",
    gstRate: "5",
  },

  // Parle Products
  "8901719101038": {
    name: "Parle-G Original Glucose Biscuits 800g",
    brand: "Parle",
    description: "Parle-G Original Glucose Biscuits family pack (800g)",
    category: "Bakery & Biscuits",
    uom: "PACK",
    hsnCode: "19053100",
    gstRate: "18",
  },
  "8901719101052": {
    name: "Parle-G Gold Glucose Biscuits 1kg",
    brand: "Parle",
    description: "Parle-G Gold Bigger & Sweeter Glucose Biscuits (1kg)",
    category: "Bakery & Biscuits",
    uom: "PACK",
    hsnCode: "19053100",
    gstRate: "18",
  },
  "8901719108150": {
    name: "Parle Hide & Seek Chocolate Chip Cookies 120g",
    brand: "Parle",
    description: "Parle Hide & Seek Real Chocolate Chip Cookies (120g)",
    category: "Bakery & Biscuits",
    uom: "PACK",
    hsnCode: "19053100",
    gstRate: "18",
  },
  "8901719104039": {
    name: "Parle Monaco Classic Salted Cheeslings Biscuits 200g",
    brand: "Parle",
    description: "Parle Monaco Light & Crunchy Salted Crackers (200g)",
    category: "Bakery & Biscuits",
    uom: "PACK",
    hsnCode: "19053100",
    gstRate: "18",
  },
  "8901719105036": {
    name: "Parle Krackjack Sweet & Salty Crackers 200g",
    brand: "Parle",
    description: "Parle Krackjack Original Sweet & Salty Biscuits (200g)",
    category: "Bakery & Biscuits",
    uom: "PACK",
    hsnCode: "19053100",
    gstRate: "18",
  },

  // Britannia Industries
  "8901063012480": {
    name: "Britannia Good Day Cashew Cookies 200g",
    brand: "Britannia",
    description: "Britannia Good Day Rich Cashew Butter Cookies (200g)",
    category: "Bakery & Biscuits",
    uom: "PACK",
    hsnCode: "19053100",
    gstRate: "18",
  },
  "8901063013210": {
    name: "Britannia Good Day Butter Cookies 200g",
    brand: "Britannia",
    description: "Britannia Good Day Butter Delight Biscuits (200g)",
    category: "Bakery & Biscuits",
    uom: "PACK",
    hsnCode: "19053100",
    gstRate: "18",
  },
  "8901063012800": {
    name: "Britannia Marie Gold Biscuits 250g",
    brand: "Britannia",
    description: "Britannia Marie Gold Crisp Tea Time Biscuits (250g)",
    category: "Bakery & Biscuits",
    uom: "PACK",
    hsnCode: "19053100",
    gstRate: "18",
  },
  "8901063024827": {
    name: "Britannia Milk Bikis Biscuits 100g",
    brand: "Britannia",
    description: "Britannia Milk Bikis Cream & Calcium Enriched Biscuits (100g)",
    category: "Bakery & Biscuits",
    uom: "PACK",
    hsnCode: "19053100",
    gstRate: "18",
  },
  "8901063018444": {
    name: "Britannia Bourbon Chocolate Cream Biscuits 150g",
    brand: "Britannia",
    description: "Britannia Bourbon Chocolate Creams with Sugar Crystals (150g)",
    category: "Bakery & Biscuits",
    uom: "PACK",
    hsnCode: "19053100",
    gstRate: "18",
  },

  // Amul (GCMMF)
  "8906001005118": {
    name: "Amul Pasteurised Butter 100g",
    brand: "Amul",
    description: "Amul Pasteurised Salted Table Butter carton (100g)",
    category: "Dairy Products",
    uom: "PACK",
    hsnCode: "04051000",
    gstRate: "12",
  },
  "8906001005125": {
    name: "Amul Pasteurised Butter 500g",
    brand: "Amul",
    description: "Amul Pasteurised Salted Table Butter carton (500g)",
    category: "Dairy Products",
    uom: "PACK",
    hsnCode: "04051000",
    gstRate: "12",
  },
  "8906001005200": {
    name: "Amul Pure Ghee Tin 1L",
    brand: "Amul",
    description: "Amul Pure Cow & Buffalo Desi Ghee Tin (1 Litre)",
    category: "Dairy Products",
    uom: "PCS",
    hsnCode: "04059020",
    gstRate: "12",
  },
  "8906001020012": {
    name: "Amul Processed Cheese Block 200g",
    brand: "Amul",
    description: "Amul Pasteurized Processed Cheese block (200g)",
    category: "Dairy Products",
    uom: "PACK",
    hsnCode: "04069000",
    gstRate: "12",
  },
  "8906001020050": {
    name: "Amul Processed Cheese Slices 200g (10 Slices)",
    brand: "Amul",
    description: "Amul Processed Cheese Slices pack of 10 (200g)",
    category: "Dairy Products",
    uom: "PACK",
    hsnCode: "04069000",
    gstRate: "12",
  },
  "8906001000106": {
    name: "Amul Taaza Homogenised Toned Milk 1L Tetra",
    brand: "Amul",
    description: "Amul Taaza Long Life Homogenised Toned Milk 1L Tetra Pak",
    category: "Dairy Products",
    uom: "PCS",
    hsnCode: "04011000",
    gstRate: "5",
  },
  "8906001000120": {
    name: "Amul Gold Homogenised Standardised Milk 1L Tetra",
    brand: "Amul",
    description: "Amul Gold Long Life Homogenised Full Cream Milk 1L Tetra Pak",
    category: "Dairy Products",
    uom: "PCS",
    hsnCode: "04012000",
    gstRate: "5",
  },

  // Adani Wilmar (Fortune)
  "8906010500114": {
    name: "Fortune Sunlite Refined Sunflower Oil 1L Pouch",
    brand: "Fortune",
    description: "Fortune Sunlite Refined Sunflower Cooking Oil 1 Litre Pouch",
    category: "Edible Oils",
    uom: "PACK",
    hsnCode: "15121910",
    gstRate: "5",
  },
  "8906010500121": {
    name: "Fortune Sunlite Refined Sunflower Oil 5L Jar",
    brand: "Fortune",
    description: "Fortune Sunlite Refined Sunflower Cooking Oil 5 Litre Can/Jar",
    category: "Edible Oils",
    uom: "PCS",
    hsnCode: "15121910",
    gstRate: "5",
  },
  "8906010501012": {
    name: "Fortune Refined Soyabean Oil 1L Pouch",
    brand: "Fortune",
    description: "Fortune Refined Soyabean Cooking Oil 1 Litre Pouch",
    category: "Edible Oils",
    uom: "PACK",
    hsnCode: "15079010",
    gstRate: "5",
  },
  "8906010502019": {
    name: "Fortune Kachi Ghani Pure Mustard Oil 1L Bottle",
    brand: "Fortune",
    description: "Fortune Kachi Ghani Pure Mustard Oil 1 Litre Pet Bottle",
    category: "Edible Oils",
    uom: "PCS",
    hsnCode: "15149110",
    gstRate: "5",
  },
  "8906010505010": {
    name: "Fortune Chakki Fresh Atta 5kg",
    brand: "Fortune",
    description: "Fortune Chakki Fresh 100% Whole Wheat Atta (5kg)",
    category: "Grains & Pulses",
    uom: "BAG",
    hsnCode: "11010000",
    gstRate: "5",
  },
  "8906010505027": {
    name: "Fortune Chakki Fresh Atta 10kg",
    brand: "Fortune",
    description: "Fortune Chakki Fresh 100% Whole Wheat Atta (10kg)",
    category: "Grains & Pulses",
    uom: "BAG",
    hsnCode: "11010000",
    gstRate: "5",
  },

  // ITC (Aashirvaad, Sunfeast, Bingo)
  "8901499008012": {
    name: "Aashirvaad Shudh Chakki Atta 5kg",
    brand: "Aashirvaad",
    description: "Aashirvaad 100% Pure Whole Wheat Chakki Atta (5kg)",
    category: "Grains & Pulses",
    uom: "BAG",
    hsnCode: "11010000",
    gstRate: "5",
  },
  "8901499008029": {
    name: "Aashirvaad Shudh Chakki Atta 10kg",
    brand: "Aashirvaad",
    description: "Aashirvaad 100% Pure Whole Wheat Chakki Atta (10kg)",
    category: "Grains & Pulses",
    uom: "BAG",
    hsnCode: "11010000",
    gstRate: "5",
  },
  "8901499015010": {
    name: "Sunfeast Dark Fantasy Choco Fills Biscuits 300g",
    brand: "Sunfeast",
    description: "Sunfeast Dark Fantasy Choco Fills Centre-Filled Cookies (300g)",
    category: "Bakery & Biscuits",
    uom: "PACK",
    hsnCode: "19053100",
    gstRate: "18",
  },
  "8901499026405": {
    name: "Sunfeast YiPPee! Magic Masala Instant Noodles 280g",
    brand: "Sunfeast",
    description: "Sunfeast YiPPee! Mood Masala Instant Noodles 4-Pack (280g)",
    category: "Instant Foods & Packaged Goods",
    uom: "PACK",
    hsnCode: "19023010",
    gstRate: "12",
  },
  "8901499020014": {
    name: "Bingo! Mad Angles Achaari Masti 66g",
    brand: "Bingo!",
    description: "Bingo! Mad Angles Tangy Achaari Masti Corn Chips (66g)",
    category: "Packaged Snacks",
    uom: "PACK",
    hsnCode: "19059040",
    gstRate: "12",
  },

  // Basmati Rice (India Gate & Daawat)
  "8906020000108": {
    name: "India Gate Basmati Rice Classic 1kg",
    brand: "India Gate",
    description: "India Gate Aged Premium Classic Basmati Rice (1kg)",
    category: "Grains & Pulses",
    uom: "BAG",
    hsnCode: "10063020",
    gstRate: "5",
  },
  "8906020000115": {
    name: "India Gate Basmati Rice Classic 5kg",
    brand: "India Gate",
    description: "India Gate Aged Premium Classic Basmati Rice (5kg)",
    category: "Grains & Pulses",
    uom: "BAG",
    hsnCode: "10063020",
    gstRate: "5",
  },
  "8906079001017": {
    name: "Daawat Rozana Gold Basmati Rice 5kg",
    brand: "Daawat",
    description: "Daawat Rozana Gold Everyday Long Grain Basmati Rice (5kg)",
    category: "Grains & Pulses",
    uom: "BAG",
    hsnCode: "10063020",
    gstRate: "5",
  },

  // Haldiram's
  "8901725111107": {
    name: "Haldiram's Nagpur Aloo Bhujia 150g",
    brand: "Haldiram's",
    description: "Haldiram's Nagpur Crispy Potato & Gram Flour Bhujia (150g)",
    category: "Packaged Snacks",
    uom: "PACK",
    hsnCode: "21069099",
    gstRate: "12",
  },
  "8901725111114": {
    name: "Haldiram's Nagpur Bhujia Sev 150g",
    brand: "Haldiram's",
    description: "Haldiram's Spicy Tepary Bean & Gram Flour Bhujia Sev (150g)",
    category: "Packaged Snacks",
    uom: "PACK",
    hsnCode: "21069099",
    gstRate: "12",
  },
  "8901725111121": {
    name: "Haldiram's Nagpur Khatta Meetha Namkeen 150g",
    brand: "Haldiram's",
    description: "Haldiram's Nagpur Sweet & Sour Crunchy Mixture (150g)",
    category: "Packaged Snacks",
    uom: "PACK",
    hsnCode: "21069099",
    gstRate: "12",
  },
  "8901725113200": {
    name: "Haldiram's Gulab Jamun Tin 1kg",
    brand: "Haldiram's",
    description: "Haldiram's Traditional Desi Ghee Gulab Jamun Tin (1kg)",
    category: "Sweets & Confectionery",
    uom: "PCS",
    hsnCode: "21069099",
    gstRate: "5",
  },

  // Everest Spices
  "8906005001019": {
    name: "Everest Garam Masala Powder 100g",
    brand: "Everest",
    description: "Everest Aromatic Garam Masala Spice Blend (100g)",
    category: "Spices & Seasonings",
    uom: "PACK",
    hsnCode: "09109100",
    gstRate: "5",
  },
  "8906005001026": {
    name: "Everest Chaat Masala 100g",
    brand: "Everest",
    description: "Everest Tangy Chaat Masala Sprinkler Pack (100g)",
    category: "Spices & Seasonings",
    uom: "PACK",
    hsnCode: "09109100",
    gstRate: "5",
  },
  "8906005001040": {
    name: "Everest Pav Bhaji Masala 100g",
    brand: "Everest",
    description: "Everest Authentic Mumbai Pav Bhaji Spice Blend (100g)",
    category: "Spices & Seasonings",
    uom: "PACK",
    hsnCode: "09109100",
    gstRate: "5",
  },
  "8906005001101": {
    name: "Everest Turmeric Powder (Haldi) 200g",
    brand: "Everest",
    description: "Everest Pure Golden Turmeric Haldi Powder (200g)",
    category: "Spices & Seasonings",
    uom: "PACK",
    hsnCode: "09103030",
    gstRate: "5",
  },
  "8906005001132": {
    name: "Everest Tikhalal Chilli Powder 200g",
    brand: "Everest",
    description: "Everest Tikhalal Sharp Hot Red Chilli Powder (200g)",
    category: "Spices & Seasonings",
    uom: "PACK",
    hsnCode: "09042211",
    gstRate: "5",
  },

  // MDH Spices
  "8901387001018": {
    name: "MDH Deggi Mirch Natural Red Chilli Powder 100g",
    brand: "MDH",
    description: "MDH Deggi Mirch Mild Glowing Red Pepper Powder (100g)",
    category: "Spices & Seasonings",
    uom: "PACK",
    hsnCode: "09042211",
    gstRate: "5",
  },
  "8901387001025": {
    name: "MDH Chunky Chat Masala 100g",
    brand: "MDH",
    description: "MDH Chunky Chat Masala Seasoning Blend (100g)",
    category: "Spices & Seasonings",
    uom: "PACK",
    hsnCode: "09109100",
    gstRate: "5",
  },
  "8901387001032": {
    name: "MDH Kitchen King Masala 100g",
    brand: "MDH",
    description: "MDH Kitchen King All Purpose Curry Masala (100g)",
    category: "Spices & Seasonings",
    uom: "PACK",
    hsnCode: "09109100",
    gstRate: "5",
  },

  // DS Group (Catch Spices)
  "8906014001016": {
    name: "Catch Table Salt Sprinkler 200g",
    brand: "Catch",
    description: "Catch Table Salt Easy Dispenser Sprinkler (200g)",
    category: "Spices & Seasonings",
    uom: "PCS",
    hsnCode: "25010010",
    gstRate: "0",
  },
  "8906014001030": {
    name: "Catch Black Pepper Sprinkler 100g",
    brand: "Catch",
    description: "Catch Pure Ground Black Pepper Sprinkler (100g)",
    category: "Spices & Seasonings",
    uom: "PCS",
    hsnCode: "09041200",
    gstRate: "5",
  },

  // HUL (Brooke Bond, Surf Excel, Vim, Lux, Dove)
  "8901030010015": {
    name: "Brooke Bond Red Label Tea 250g",
    brand: "Brooke Bond",
    description: "Brooke Bond Red Label Black Tea Pack (250g)",
    category: "Beverages",
    uom: "PACK",
    hsnCode: "09024020",
    gstRate: "5",
  },
  "8901030010022": {
    name: "Brooke Bond Red Label Tea 500g",
    brand: "Brooke Bond",
    description: "Brooke Bond Red Label Black Tea Pack (500g)",
    category: "Beverages",
    uom: "PACK",
    hsnCode: "09024020",
    gstRate: "5",
  },
  "8901030013016": {
    name: "Bru Instant Coffee 100g Jar",
    brand: "Bru",
    description: "Bru Instant Coffee Chicory Blend Glass Jar (100g)",
    category: "Beverages",
    uom: "PCS",
    hsnCode: "21011110",
    gstRate: "18",
  },
  "8901030700107": {
    name: "Kissan Fresh Tomato Ketchup 1kg",
    brand: "Kissan",
    description: "Kissan Fresh 100% Real Tomato Ketchup Bottle (1kg)",
    category: "Sauces & Condiments",
    uom: "PCS",
    hsnCode: "21032000",
    gstRate: "12",
  },
  "8901030381016": {
    name: "Surf Excel Easy Wash Detergent Powder 1kg",
    brand: "Surf Excel",
    description: "Surf Excel Easy Wash Fabric Washing Detergent (1kg)",
    category: "Home Care & Cleaning",
    uom: "PACK",
    hsnCode: "34029099",
    gstRate: "18",
  },
  "8901030391015": {
    name: "Vim Dishwash Bar 300g",
    brand: "Vim",
    description: "Vim Lemon Dishwash Cleaner Bar (300g)",
    category: "Home Care & Cleaning",
    uom: "PCS",
    hsnCode: "34011942",
    gstRate: "18",
  },
  "8901030510010": {
    name: "Lifebuoy Total 10 Germ Protection Bathing Soap 125g",
    brand: "Lifebuoy",
    description: "Lifebuoy Total 10 Antibacterial Bathing Soap bar (125g)",
    category: "Personal Care & Bathing",
    uom: "PCS",
    hsnCode: "34011110",
    gstRate: "18",
  },
  "8901030530018": {
    name: "Dove Cream Beauty Bathing Bar 100g",
    brand: "Dove",
    description: "Dove Cream Beauty Moisturising Bathing Bar (100g)",
    category: "Personal Care & Bathing",
    uom: "PCS",
    hsnCode: "34011110",
    gstRate: "18",
  },

  // Colgate-Palmolive
  "8901012111018": {
    name: "Colgate Strong Teeth Dental Cream Toothpaste 100g",
    brand: "Colgate",
    description: "Colgate Strong Teeth Amino Shakti Calcium Toothpaste (100g)",
    category: "Personal Care & Oral Care",
    uom: "PCS",
    hsnCode: "33061020",
    gstRate: "18",
  },
  "8901012111025": {
    name: "Colgate Strong Teeth Dental Cream Toothpaste 200g",
    brand: "Colgate",
    description: "Colgate Strong Teeth Amino Shakti Calcium Toothpaste (200g)",
    category: "Personal Care & Oral Care",
    uom: "PCS",
    hsnCode: "33061020",
    gstRate: "18",
  },
  "8901012121017": {
    name: "Colgate MaxFresh Peppermint Ice Gel Toothpaste 150g",
    brand: "Colgate",
    description: "Colgate MaxFresh Blue Cooling Crystals Gel Toothpaste (150g)",
    category: "Personal Care & Oral Care",
    uom: "PCS",
    hsnCode: "33061020",
    gstRate: "18",
  },

  // Reckitt (Dettol, Harpic, Lizol)
  "8901023001011": {
    name: "Dettol Original Antiseptic Liquid 250ml",
    brand: "Dettol",
    description: "Dettol Disinfectant & First Aid Antiseptic Liquid (250ml)",
    category: "Healthcare & Antiseptic",
    uom: "PCS",
    hsnCode: "30049089",
    gstRate: "12",
  },
  "8901023011010": {
    name: "Dettol Original Germ Protection Bathing Soap 75g",
    brand: "Dettol",
    description: "Dettol Original Pine Fragrance Germ Protection Soap (75g)",
    category: "Personal Care & Bathing",
    uom: "PCS",
    hsnCode: "34011110",
    gstRate: "18",
  },
  "8901023021019": {
    name: "Harpic Power Plus Disinfectant Toilet Cleaner 500ml",
    brand: "Harpic",
    description: "Harpic Power Plus Original Disinfectant Toilet Cleaner (500ml)",
    category: "Home Care & Cleaning",
    uom: "PCS",
    hsnCode: "34029099",
    gstRate: "18",
  },
  "8901023031018": {
    name: "Lizol Disinfectant Floor Cleaner Citrus 500ml",
    brand: "Lizol",
    description: "Lizol Surface & Floor Disinfectant Cleaner Citrus Fragrance (500ml)",
    category: "Home Care & Cleaning",
    uom: "PCS",
    hsnCode: "38089400",
    gstRate: "18",
  },

  // Mondelez (Cadbury)
  "8901233001012": {
    name: "Cadbury Dairy Milk Chocolate Bar 13.2g",
    brand: "Cadbury",
    description: "Cadbury Dairy Milk Smooth Milk Chocolate Bar (13.2g)",
    category: "Confectionery & Chocolates",
    uom: "PCS",
    hsnCode: "18063200",
    gstRate: "18",
  },
  "8901233001029": {
    name: "Cadbury Dairy Milk Chocolate Bar 52g",
    brand: "Cadbury",
    description: "Cadbury Dairy Milk Smooth Milk Chocolate Bar (52g)",
    category: "Confectionery & Chocolates",
    uom: "PCS",
    hsnCode: "18063200",
    gstRate: "18",
  },
  "8901233004013": {
    name: "Cadbury Bournvita Chocolate Health Nutrition Drink 500g Jar",
    brand: "Bournvita",
    description: "Cadbury Bournvita Chocolate Nutrition Drink Jar (500g)",
    category: "Beverages",
    uom: "PCS",
    hsnCode: "19019090",
    gstRate: "18",
  },
  "8901233021010": {
    name: "Oreo Original Vanilla Crème Sandwich Biscuits 120g",
    brand: "Oreo",
    description: "Cadbury Oreo Chocolate Cookies with Vanilla Cream (120g)",
    category: "Bakery & Biscuits",
    uom: "PACK",
    hsnCode: "19053100",
    gstRate: "18",
  },

  // Marico (Parachute & Saffola)
  "8901262001015": {
    name: "Parachute 100% Pure Coconut Hair Oil 100ml",
    brand: "Parachute",
    description: "Parachute Pure Edible Coconut Oil Blue Bottle (100ml)",
    category: "Personal Care & Hair Care",
    uom: "PCS",
    hsnCode: "15131900",
    gstRate: "5",
  },
  "8901262001022": {
    name: "Parachute 100% Pure Coconut Hair Oil 200ml",
    brand: "Parachute",
    description: "Parachute Pure Edible Coconut Oil Blue Bottle (200ml)",
    category: "Personal Care & Hair Care",
    uom: "PCS",
    hsnCode: "15131900",
    gstRate: "5",
  },
  "8901262011014": {
    name: "Saffola Gold Blended Edible Cooking Oil 1L Pouch",
    brand: "Saffola",
    description: "Saffola Gold Pro Healthy Heart Blended Cooking Oil (1L Pouch)",
    category: "Edible Oils",
    uom: "PACK",
    hsnCode: "15179010",
    gstRate: "5",
  },

  // Dabur
  "8901207001010": {
    name: "Dabur Red Ayurvedic Toothpaste 100g",
    brand: "Dabur",
    description: "Dabur Red Ayurvedic Clove & Pudina Toothpaste (100g)",
    category: "Personal Care & Oral Care",
    uom: "PCS",
    hsnCode: "33061020",
    gstRate: "18",
  },
  "8901207011019": {
    name: "Dabur Chyawanprash Immunity Booster 500g Jar",
    brand: "Dabur",
    description: "Dabur Chyawanprash 2X Immunity Booster Ayurvedic Formulation (500g)",
    category: "Healthcare & Ayurvedic",
    uom: "PCS",
    hsnCode: "30049011",
    gstRate: "12",
  },
  "8901207021018": {
    name: "Dabur 100% Pure Honey Squeezy Bottle 500g",
    brand: "Dabur",
    description: "Dabur 100% Pure Squeezy Natural Honey (500g)",
    category: "Grocery & Staples",
    uom: "PCS",
    hsnCode: "04090000",
    gstRate: "5",
  },
  "8901207031017": {
    name: "Real Fruit Power Mixed Fruit Juice 1L Tetra",
    brand: "Real",
    description: "Dabur Real Fruit Power 100% Mixed Fruit Beverage (1L Tetra)",
    category: "Beverages",
    uom: "PCS",
    hsnCode: "22029920",
    gstRate: "12",
  },

  // Patanjali
  "8902579001011": {
    name: "Patanjali Dant Kanti Ayurvedic Toothpaste 100g",
    brand: "Patanjali",
    description: "Patanjali Dant Kanti Natural Herbal Dental Cream (100g)",
    category: "Personal Care & Oral Care",
    uom: "PCS",
    hsnCode: "33061020",
    gstRate: "18",
  },
  "8902579011010": {
    name: "Patanjali Pure Desi Cow Ghee 1L Carton",
    brand: "Patanjali",
    description: "Patanjali Pure Clarified Desi Cow Milk Ghee (1 Litre)",
    category: "Dairy Products",
    uom: "PCS",
    hsnCode: "04059020",
    gstRate: "12",
  },

  // Himalaya
  "8904004400105": {
    name: "Himalaya Purifying Neem Face Wash 100ml",
    brand: "Himalaya",
    description: "Himalaya Herbals Purifying Neem Face Wash for Acne-Prone Skin (100ml)",
    category: "Personal Care & Skin Care",
    uom: "PCS",
    hsnCode: "34013000",
    gstRate: "18",
  },

  // Pidilite
  "8901015001011": {
    name: "Fevicol MR General Purpose White Adhesive 100g Squeezy Bottle",
    brand: "Fevicol",
    description: "Pidilite Fevicol MR Craft & Wood Adhesive (100g)",
    category: "Stationery & Adhesives",
    uom: "PCS",
    hsnCode: "35061000",
    gstRate: "18",
  },
  "8901015011010": {
    name: "Fevikwik Instant Adhesive Glue 3g Tube",
    brand: "Fevikwik",
    description: "Pidilite Fevikwik One Drop Instant Cyanoacrylate Adhesive (3g)",
    category: "Stationery & Adhesives",
    uom: "PCS",
    hsnCode: "35061000",
    gstRate: "18",
  },

  // --- PACKAGED DRINKING WATER & MINERAL WATER ---
  "8906003920042": {
    name: "Bisleri Packaged Drinking Water with Added Minerals 1L",
    brand: "Bisleri",
    description: "Bisleri 1 Litre Mineral Water Bottle with Ozoteck Purified Water",
    category: "Packaged Drinking Water & Beverages",
    uom: "PCS",
    hsnCode: "22011010",
    gstRate: "18",
  },
  "8906003920011": {
    name: "Bisleri Packaged Drinking Water with Added Minerals 500ml",
    brand: "Bisleri",
    description: "Bisleri 500ml Mineral Water Bottle",
    category: "Packaged Drinking Water & Beverages",
    uom: "PCS",
    hsnCode: "22011010",
    gstRate: "18",
  },
  "8906003920066": {
    name: "Bisleri Packaged Drinking Water 2L",
    brand: "Bisleri",
    description: "Bisleri 2 Litre Mineral Water Bottle",
    category: "Packaged Drinking Water & Beverages",
    uom: "PCS",
    hsnCode: "22011010",
    gstRate: "18",
  },
  "8906003920158": {
    name: "Bisleri Packaged Drinking Water 250ml",
    brand: "Bisleri",
    description: "Bisleri 250ml Mini Mineral Water Bottle",
    category: "Packaged Drinking Water & Beverages",
    uom: "PCS",
    hsnCode: "22011010",
    gstRate: "18",
  },
  "8906003920097": {
    name: "Bisleri Packaged Drinking Water 5L Can",
    brand: "Bisleri",
    description: "Bisleri 5 Litre Mineral Water Jar with Dispenser Tap",
    category: "Packaged Drinking Water & Beverages",
    uom: "PCS",
    hsnCode: "22011010",
    gstRate: "18",
  },
  "8906003920110": {
    name: "Bisleri Packaged Drinking Water 20L Bulk Jar",
    brand: "Bisleri",
    description: "Bisleri 20 Litre Returnable Mineral Water Jar for Dispensers",
    category: "Packaged Drinking Water & Beverages",
    uom: "PCS",
    hsnCode: "22011010",
    gstRate: "18",
  },
  "8901491101838": {
    name: "Kinley Packaged Drinking Water with Added Minerals 1L",
    brand: "Kinley",
    description: "Kinley 1 Litre Packaged Drinking Water Bottle (Coca-Cola)",
    category: "Packaged Drinking Water & Beverages",
    uom: "PCS",
    hsnCode: "22011010",
    gstRate: "18",
  },
  "8901491101821": {
    name: "Kinley Packaged Drinking Water 500ml",
    brand: "Kinley",
    description: "Kinley 500ml Drinking Water Bottle (Coca-Cola)",
    category: "Packaged Drinking Water & Beverages",
    uom: "PCS",
    hsnCode: "22011010",
    gstRate: "18",
  },
  "8901491101852": {
    name: "Kinley Packaged Drinking Water 2L",
    brand: "Kinley",
    description: "Kinley 2 Litre Drinking Water Bottle (Coca-Cola)",
    category: "Packaged Drinking Water & Beverages",
    uom: "PCS",
    hsnCode: "22011010",
    gstRate: "18",
  },
  "8901138810014": {
    name: "Aquafina Packaged Drinking Water 1L",
    brand: "Aquafina",
    description: "Aquafina Pure Water 1 Litre Bottle (PepsiCo)",
    category: "Packaged Drinking Water & Beverages",
    uom: "PCS",
    hsnCode: "22011010",
    gstRate: "18",
  },
  "8901138810021": {
    name: "Aquafina Packaged Drinking Water 500ml",
    brand: "Aquafina",
    description: "Aquafina Pure Water 500ml Bottle (PepsiCo)",
    category: "Packaged Drinking Water & Beverages",
    uom: "PCS",
    hsnCode: "22011010",
    gstRate: "18",
  },
  "8908000490013": {
    name: "Rail Neer Packaged Drinking Water 1L",
    brand: "Rail Neer",
    description: "IRCTC Rail Neer Packaged Drinking Water Bottle 1 Litre",
    category: "Packaged Drinking Water & Beverages",
    uom: "PCS",
    hsnCode: "22011010",
    gstRate: "18",
  },
  "8901725121014": {
    name: "Bailey Packaged Drinking Water 1L",
    brand: "Bailey",
    description: "Parle Agro Bailey Packaged Drinking Water 1 Litre Bottle",
    category: "Packaged Drinking Water & Beverages",
    uom: "PCS",
    hsnCode: "22011010",
    gstRate: "18",
  },
  "8901052028015": {
    name: "Tata Copper+ Enhanced Packaged Drinking Water 1L",
    brand: "Tata",
    description: "Tata Copper Plus Enhanced Mineral Water 1 Litre Bottle",
    category: "Packaged Drinking Water & Beverages",
    uom: "PCS",
    hsnCode: "22011010",
    gstRate: "18",
  },
  "8901052025014": {
    name: "Himalayan Natural Mineral Water 1L Glass Bottle",
    brand: "Himalayan",
    description: "Himalayan Source Natural Mineral Water 1 Litre (Tata Consumer)",
    category: "Packaged Drinking Water & Beverages",
    uom: "PCS",
    hsnCode: "22011010",
    gstRate: "18",
  },

  // --- BATHING SOAPS & BARS ---
  "8901023011027": {
    name: "Dettol Original Germ Protection Bathing Soap 125g",
    brand: "Dettol",
    description: "Dettol Original Germ Protection Bath Soap (125g)",
    category: "Personal Care & Bathing",
    uom: "PCS",
    hsnCode: "34011110",
    gstRate: "18",
  },
  "8901023011218": {
    name: "Dettol Cool Menthol Germ Protection Bathing Soap 75g",
    brand: "Dettol",
    description: "Dettol Cool with Crispy Menthol Soap Bar (75g)",
    category: "Personal Care & Bathing",
    uom: "PCS",
    hsnCode: "34011110",
    gstRate: "18",
  },
  "8901023011317": {
    name: "Dettol Skincare Germ Protection Bathing Soap 75g",
    brand: "Dettol",
    description: "Dettol Skincare with Nourishing Multi-Vitamins Soap (75g)",
    category: "Personal Care & Bathing",
    uom: "PCS",
    hsnCode: "34011110",
    gstRate: "18",
  },
  "8901030510218": {
    name: "Lifebuoy Lemon Fresh Bathing Soap 125g",
    brand: "Lifebuoy",
    description: "Lifebuoy Lemon Fresh Germ Protection Bath Soap (125g)",
    category: "Personal Care & Bathing",
    uom: "PCS",
    hsnCode: "34011110",
    gstRate: "18",
  },
  "8901030510317": {
    name: "Lifebuoy Care with Milk Cream Bathing Soap 125g",
    brand: "Lifebuoy",
    description: "Lifebuoy Care Bathing Bar with Milk Cream (125g)",
    category: "Personal Care & Bathing",
    uom: "PCS",
    hsnCode: "34011110",
    gstRate: "18",
  },
  "8901030520026": {
    name: "Lux Velvet Glow Jasmine & Almond Oil Soap 125g",
    brand: "Lux",
    description: "Lux Velvet Glow Beauty Soap with Jasmine and Almond Oil (125g)",
    category: "Personal Care & Bathing",
    uom: "PCS",
    hsnCode: "34011110",
    gstRate: "18",
  },
  "8901030520118": {
    name: "Lux Soft Glow French Rose & Vitamin C Soap 100g",
    brand: "Lux",
    description: "Lux Soft Glow Rose Beauty Bathing Bar (100g)",
    category: "Personal Care & Bathing",
    uom: "PCS",
    hsnCode: "34011110",
    gstRate: "18",
  },
  "8901030530025": {
    name: "Dove Cream Beauty Bathing Bar 125g",
    brand: "Dove",
    description: "Dove Cream Beauty Moisturising Bathing Bar with 1/4 Moisturising Cream (125g)",
    category: "Personal Care & Bathing",
    uom: "PCS",
    hsnCode: "34011110",
    gstRate: "18",
  },
  "8901030530032": {
    name: "Dove Cream Beauty Bathing Bar 75g",
    brand: "Dove",
    description: "Dove Cream Beauty Moisturising Bathing Bar (75g)",
    category: "Personal Care & Bathing",
    uom: "PCS",
    hsnCode: "34011110",
    gstRate: "18",
  },
  "8901030530049": {
    name: "Dove Cream Beauty Bathing Bar 50g",
    brand: "Dove",
    description: "Dove Cream Beauty Moisturising Bathing Bar travel pack (50g)",
    category: "Personal Care & Bathing",
    uom: "PCS",
    hsnCode: "34011110",
    gstRate: "18",
  },
  "8901030540017": {
    name: "Pears Pure & Gentle Bathing Bar 125g",
    brand: "Pears",
    description: "Pears Pure and Gentle Glycerine Bathing Bar (125g)",
    category: "Personal Care & Bathing",
    uom: "PCS",
    hsnCode: "34011110",
    gstRate: "18",
  },
  "8901030540024": {
    name: "Pears Pure & Gentle Bathing Bar 75g",
    brand: "Pears",
    description: "Pears Pure and Gentle Glycerine Bathing Bar (75g)",
    category: "Personal Care & Bathing",
    uom: "PCS",
    hsnCode: "34011110",
    gstRate: "18",
  },
  "8901022001029": {
    name: "Santoor Sandal and Turmeric Bathing Soap 125g",
    brand: "Santoor",
    description: "Santoor Sandal & Turmeric Ayurvedic Glow Bathing Soap (125g)",
    category: "Personal Care & Bathing",
    uom: "PCS",
    hsnCode: "34011110",
    gstRate: "18",
  },
  "8901022001036": {
    name: "Santoor Sandal and Turmeric Bathing Soap 150g",
    brand: "Santoor",
    description: "Santoor Sandal & Turmeric Glow Bathing Soap family size (150g)",
    category: "Personal Care & Bathing",
    uom: "PCS",
    hsnCode: "34011110",
    gstRate: "18",
  },
  "8901022001111": {
    name: "Santoor Aloe Fresh Bathing Soap 100g",
    brand: "Santoor",
    description: "Santoor Aloe Fresh with Aloe Vera and Lime Soap (100g)",
    category: "Personal Care & Bathing",
    uom: "PCS",
    hsnCode: "34011110",
    gstRate: "18",
  },
  "8901764011119": {
    name: "Cinthol Cool Menthol Bathing Soap 100g",
    brand: "Cinthol",
    description: "Cinthol Cool Deodorant Menthol Soap (100g)",
    category: "Personal Care & Bathing",
    uom: "PCS",
    hsnCode: "34011110",
    gstRate: "18",
  },
  "8901764011218": {
    name: "Cinthol Lime Refreshing Bathing Soap 100g",
    brand: "Cinthol",
    description: "Cinthol Lime Burst Citrus Fresh Bathing Soap (100g)",
    category: "Personal Care & Bathing",
    uom: "PCS",
    hsnCode: "34011110",
    gstRate: "18",
  },
  "8901416001018": {
    name: "Mysore Sandal Soap 75g",
    brand: "Mysore Sandal",
    description: "Mysore Sandal 100% Pure Natural Sandalwood Oil Soap (75g)",
    category: "Personal Care & Bathing",
    uom: "PCS",
    hsnCode: "34011110",
    gstRate: "18",
  },
  "8901416001025": {
    name: "Mysore Sandal Soap 150g",
    brand: "Mysore Sandal",
    description: "Mysore Sandal Pure Sandalwood Oil Traditional Soap (150g)",
    category: "Personal Care & Bathing",
    uom: "PCS",
    hsnCode: "34011110",
    gstRate: "18",
  },
  "8901416001117": {
    name: "Mysore Sandal Gold Pure Sandalwood Oil Soap 125g",
    brand: "Mysore Sandal",
    description: "Mysore Sandal Gold Luxury Bathing Soap (125g)",
    category: "Personal Care & Bathing",
    uom: "PCS",
    hsnCode: "34011110",
    gstRate: "18",
  },
  "8904018301019": {
    name: "Medimix Ayurvedic 18 Herbs Classic Bathing Soap 125g",
    brand: "Medimix",
    description: "Medimix Ayurvedic 18 Herbs Skin Protection Soap (125g)",
    category: "Personal Care & Bathing",
    uom: "PCS",
    hsnCode: "34011110",
    gstRate: "18",
  },
  "8904018301026": {
    name: "Medimix Ayurvedic 18 Herbs Classic Bathing Soap 75g",
    brand: "Medimix",
    description: "Medimix Ayurvedic 18 Herbs Skin Protection Soap (75g)",
    category: "Personal Care & Bathing",
    uom: "PCS",
    hsnCode: "34011110",
    gstRate: "18",
  },
  "8901030550016": {
    name: "Hamam Neem Tulsi & Aloe Vera Soap 100g",
    brand: "Hamam",
    description: "Hamam 100% Pure Neem Tulsi and Aloe Vera Soap (100g)",
    category: "Personal Care & Bathing",
    uom: "PCS",
    hsnCode: "34011110",
    gstRate: "18",
  },
  "8901764021019": {
    name: "Godrej No.1 Sandal & Turmeric Bathing Soap 100g",
    brand: "Godrej",
    description: "Godrej No.1 Sandal and Turmeric Grade 1 Bath Soap (100g)",
    category: "Personal Care & Bathing",
    uom: "PCS",
    hsnCode: "34011110",
    gstRate: "18",
  },
  "8901499031010": {
    name: "Fiama Di Wills Blackcurrant & Bearberry Gel Bar 125g",
    brand: "Fiama",
    description: "Fiama Di Wills Exotic Moisture Gel Bathing Bar (125g)",
    category: "Personal Care & Bathing",
    uom: "PCS",
    hsnCode: "34011110",
    gstRate: "18",
  },
  "8901499032017": {
    name: "Vivel Aloe Vera Satin Soft Bathing Soap 100g",
    brand: "Vivel",
    description: "Vivel Aloe Vera and Vitamin E Nourishing Soap Bar (100g)",
    category: "Personal Care & Bathing",
    uom: "PCS",
    hsnCode: "34011110",
    gstRate: "18",
  },
  "8901030560015": {
    name: "Liril Lemon & Tea Tree Oil Freshness Soap 125g",
    brand: "Liril",
    description: "Liril Lemon & Tea Tree Oil Alive Freshness Bathing Soap (125g)",
    category: "Personal Care & Bathing",
    uom: "PCS",
    hsnCode: "34011110",
    gstRate: "18",
  },

  // --- LOTIONS & SKIN CREAMS ---
  "8901030368116": {
    name: "Vaseline Intensive Care Deep Restore Body Lotion 100ml",
    brand: "Vaseline",
    description: "Vaseline Intensive Care Deep Restore with Pure Oat Extract (100ml)",
    category: "Personal Care & Skin Care",
    uom: "PCS",
    hsnCode: "33049990",
    gstRate: "18",
  },
  "8901030368123": {
    name: "Vaseline Intensive Care Deep Restore Body Lotion 200ml",
    brand: "Vaseline",
    description: "Vaseline Intensive Care Deep Restore Body Lotion (200ml)",
    category: "Personal Care & Skin Care",
    uom: "PCS",
    hsnCode: "33049990",
    gstRate: "18",
  },
  "8901030368130": {
    name: "Vaseline Intensive Care Deep Restore Body Lotion 400ml Pump",
    brand: "Vaseline",
    description: "Vaseline Intensive Care Deep Restore Body Lotion Smart Pump (400ml)",
    category: "Personal Care & Skin Care",
    uom: "PCS",
    hsnCode: "33049990",
    gstRate: "18",
  },
  "8901030368215": {
    name: "Vaseline Intensive Care Aloe Fresh Body Lotion 200ml",
    brand: "Vaseline",
    description: "Vaseline Intensive Care Aloe Fresh Hydrating Body Gel Lotion (200ml)",
    category: "Personal Care & Skin Care",
    uom: "PCS",
    hsnCode: "33049990",
    gstRate: "18",
  },
  "8901030368222": {
    name: "Vaseline Intensive Care Aloe Fresh Body Lotion 400ml",
    brand: "Vaseline",
    description: "Vaseline Intensive Care Aloe Fresh Hydrating Lotion Pump Bottle (400ml)",
    category: "Personal Care & Skin Care",
    uom: "PCS",
    hsnCode: "33049990",
    gstRate: "18",
  },
  "8901030368314": {
    name: "Vaseline Intensive Care Cocoa Glow Body Lotion 200ml",
    brand: "Vaseline",
    description: "Vaseline Intensive Care Cocoa Glow with 100% Pure Cocoa Butter (200ml)",
    category: "Personal Care & Skin Care",
    uom: "PCS",
    hsnCode: "33049990",
    gstRate: "18",
  },
  "8901030368321": {
    name: "Vaseline Intensive Care Cocoa Glow Body Lotion 400ml Pump",
    brand: "Vaseline",
    description: "Vaseline Intensive Care Cocoa Glow Deep Radiant Moisture Pump (400ml)",
    category: "Personal Care & Skin Care",
    uom: "PCS",
    hsnCode: "33049990",
    gstRate: "18",
  },
  "8901030368413": {
    name: "Vaseline Healthy Bright Daily Brightening Body Lotion 200ml",
    brand: "Vaseline",
    description: "Vaseline Healthy Bright Daily Brightening Lotion with Vitamin B3 (200ml)",
    category: "Personal Care & Skin Care",
    uom: "PCS",
    hsnCode: "33049990",
    gstRate: "18",
  },
  "8901030368017": {
    name: "Vaseline Original Pure Skin Jelly 50g",
    brand: "Vaseline",
    description: "Vaseline 100% Pure Triple-Purified Petroleum Jelly (50g)",
    category: "Personal Care & Skin Care",
    uom: "PCS",
    hsnCode: "27121010",
    gstRate: "18",
  },
  "8901030368024": {
    name: "Vaseline Original Pure Skin Jelly 100g",
    brand: "Vaseline",
    description: "Vaseline 100% Pure Triple-Purified Petroleum Jelly Tub (100g)",
    category: "Personal Care & Skin Care",
    uom: "PCS",
    hsnCode: "27121010",
    gstRate: "18",
  },
  "8904052401015": {
    name: "Nivea Nourishing Body Milk Body Lotion 120ml",
    brand: "Nivea",
    description: "Nivea Body Milk Nourishing Lotion with Deep Moisture Serum (120ml)",
    category: "Personal Care & Skin Care",
    uom: "PCS",
    hsnCode: "33049990",
    gstRate: "18",
  },
  "8904052401022": {
    name: "Nivea Nourishing Body Milk Body Lotion 200ml",
    brand: "Nivea",
    description: "Nivea Body Milk Nourishing Lotion with Almond Oil for Very Dry Skin (200ml)",
    category: "Personal Care & Skin Care",
    uom: "PCS",
    hsnCode: "33049990",
    gstRate: "18",
  },
  "8904052401039": {
    name: "Nivea Nourishing Body Milk Body Lotion 400ml Pump",
    brand: "Nivea",
    description: "Nivea Body Milk Nourishing Lotion Smart Pump Bottle (400ml)",
    category: "Personal Care & Skin Care",
    uom: "PCS",
    hsnCode: "33049990",
    gstRate: "18",
  },
  "8904052402012": {
    name: "Nivea Soft Light Moisturiser Cream 50ml",
    brand: "Nivea",
    description: "Nivea Soft Light Moisturising Cream with Vitamin E & Jojoba Oil (50ml)",
    category: "Personal Care & Skin Care",
    uom: "PCS",
    hsnCode: "33049990",
    gstRate: "18",
  },
  "8904052402029": {
    name: "Nivea Soft Light Moisturiser Cream 100ml",
    brand: "Nivea",
    description: "Nivea Soft Light Moisturising Cream Tub (100ml)",
    category: "Personal Care & Skin Care",
    uom: "PCS",
    hsnCode: "33049990",
    gstRate: "18",
  },
  "8904052402036": {
    name: "Nivea Soft Light Moisturiser Cream 200ml",
    brand: "Nivea",
    description: "Nivea Soft Refreshingly Soft Moisturising Cream Tub (200ml)",
    category: "Personal Care & Skin Care",
    uom: "PCS",
    hsnCode: "33049990",
    gstRate: "18",
  },
  "8904052403019": {
    name: "Nivea Creme Multi-Purpose Moisturising Cream 50ml Tin",
    brand: "Nivea",
    description: "Nivea Creme Rich Intensive Moisturiser Classic Blue Tin (50ml)",
    category: "Personal Care & Skin Care",
    uom: "PCS",
    hsnCode: "33049990",
    gstRate: "18",
  },
  "8904052403026": {
    name: "Nivea Creme Multi-Purpose Moisturising Cream 100ml Tin",
    brand: "Nivea",
    description: "Nivea Creme Rich Intensive Moisturiser Classic Blue Tin (100ml)",
    category: "Personal Care & Skin Care",
    uom: "PCS",
    hsnCode: "33049990",
    gstRate: "18",
  },
  "8901262021013": {
    name: "Parachute Advansed Deep Nourish Body Lotion 250ml",
    brand: "Parachute",
    description: "Parachute Advansed Body Lotion Deep Nourish with 100% Pure Coconut Milk (250ml)",
    category: "Personal Care & Skin Care",
    uom: "PCS",
    hsnCode: "33049990",
    gstRate: "18",
  },
  "8906007410015": {
    name: "Joy Honey & Almonds Nourishing Body Lotion 200ml",
    brand: "Joy",
    description: "Joy Honey & Almonds Advanced Nourishing Body Lotion (200ml)",
    category: "Personal Care & Skin Care",
    uom: "PCS",
    hsnCode: "33049990",
    gstRate: "18",
  },
  "8906007410022": {
    name: "Joy Honey & Almonds Nourishing Body Lotion 300ml Pump",
    brand: "Joy",
    description: "Joy Honey & Almonds Advanced Nourishing Body Lotion Smart Pump (300ml)",
    category: "Personal Care & Skin Care",
    uom: "PCS",
    hsnCode: "33049990",
    gstRate: "18",
  },
  "8901314031012": {
    name: "Boroplus Doodh Kesar Body Lotion 200ml",
    brand: "Boroplus",
    description: "Boroplus Ayurvedic Doodh Kesar Deep Moisture Body Lotion (200ml)",
    category: "Personal Care & Skin Care",
    uom: "PCS",
    hsnCode: "30049089",
    gstRate: "12",
  },
  "8904004402017": {
    name: "Himalaya Nourishing Skin Cream 100ml",
    brand: "Himalaya",
    description: "Himalaya Herbals All Day Moisturizing Nourishing Skin Cream (100ml)",
    category: "Personal Care & Skin Care",
    uom: "PCS",
    hsnCode: "33049990",
    gstRate: "18",
  },
  "8904004402024": {
    name: "Himalaya Nourishing Skin Cream 200ml",
    brand: "Himalaya",
    description: "Himalaya Herbals All Day Moisturizing Nourishing Skin Cream Tub (200ml)",
    category: "Personal Care & Skin Care",
    uom: "PCS",
    hsnCode: "33049990",
    gstRate: "18",
  },
  "8904004402116": {
    name: "Himalaya Herbals Cocoa Butter Intensive Body Lotion 200ml",
    brand: "Himalaya",
    description: "Himalaya Cocoa Butter Intensive Body Lotion for Extra Dry Skin (200ml)",
    category: "Personal Care & Skin Care",
    uom: "PCS",
    hsnCode: "33049990",
    gstRate: "18",
  },
  "8901030351019": {
    name: "Pond's Triple Vitamin Moisturising Body Lotion 200ml",
    brand: "Pond's",
    description: "Pond's Triple Vitamin Silk Body Lotion with Vitamin B3, E & C (200ml)",
    category: "Personal Care & Skin Care",
    uom: "PCS",
    hsnCode: "33049990",
    gstRate: "18",
  },
  "8901030351026": {
    name: "Pond's Triple Vitamin Moisturising Body Lotion 300ml Pump",
    brand: "Pond's",
    description: "Pond's Triple Vitamin Silk Body Lotion Smart Pump Dispenser (300ml)",
    category: "Personal Care & Skin Care",
    uom: "PCS",
    hsnCode: "33049990",
    gstRate: "18",
  },
  "8901030352016": {
    name: "Pond's Light Moisturiser Non-Oily Cream 75ml",
    brand: "Pond's",
    description: "Pond's Light Moisturiser with Vitamin E and Glycerine Tub (75ml)",
    category: "Personal Care & Skin Care",
    uom: "PCS",
    hsnCode: "33049990",
    gstRate: "18",
  },
  "8901030341010": {
    name: "Lakmé Peach Milk Moisturizer Body Lotion 120ml",
    brand: "Lakmé",
    description: "Lakmé Peach Milk Ultra Light Gel Moisturizer (120ml)",
    category: "Personal Care & Skin Care",
    uom: "PCS",
    hsnCode: "33049990",
    gstRate: "18",
  },
  "8901030331011": {
    name: "Glow & Lovely Advanced Multivitamin Face Cream 50g",
    brand: "Glow & Lovely",
    description: "Glow & Lovely (formerly Fair & Lovely) Advanced Multivitamin Daily Glow Cream (50g)",
    category: "Personal Care & Skin Care",
    uom: "PCS",
    hsnCode: "33049990",
    gstRate: "18",
  },
  "8901323001013": {
    name: "Boroline Antiseptic Ayurvedic Skin Cream 20g Tube",
    brand: "Boroline",
    description: "Boroline Original Antiseptic Ayurvedic Protective Skin Cream (20g)",
    category: "Personal Care & Skin Care",
    uom: "PCS",
    hsnCode: "30049089",
    gstRate: "12",
  },
  "8901323001020": {
    name: "Boroline Antiseptic Ayurvedic Skin Cream 40g Tub",
    brand: "Boroline",
    description: "Boroline Original Antiseptic Ayurvedic Protective Skin Cream Tub (40g)",
    category: "Personal Care & Skin Care",
    uom: "PCS",
    hsnCode: "30049089",
    gstRate: "12",
  },
  "8901288001013": {
    name: "Vicco Turmeric Skin Cream 30g Tube",
    brand: "Vicco",
    description: "Vicco Turmeric Ayurvedic Skin Cream with Pure Turmeric Extract (30g)",
    category: "Personal Care & Skin Care",
    uom: "PCS",
    hsnCode: "30049011",
    gstRate: "12",
  },
  "8901288001020": {
    name: "Vicco Turmeric Skin Cream 50g Tube",
    brand: "Vicco",
    description: "Vicco Turmeric Ayurvedic Skin Cream (50g)",
    category: "Personal Care & Skin Care",
    uom: "PCS",
    hsnCode: "30049011",
    gstRate: "12",
  },

  // --- BEVERAGES & COLD DRINKS ---
  "8901491102019": {
    name: "Thums Up Charged Soft Drink Pet Bottle 750ml",
    brand: "Thums Up",
    description: "Thums Up Strong Cola Carbonated Beverage 750ml Bottle",
    category: "Beverages",
    uom: "PCS",
    hsnCode: "22021010",
    gstRate: "28",
  },
  "8901491102026": {
    name: "Thums Up Soft Drink Pet Bottle 600ml",
    brand: "Thums Up",
    description: "Thums Up Strong Carbonated Cola 600ml Bottle",
    category: "Beverages",
    uom: "PCS",
    hsnCode: "22021010",
    gstRate: "28",
  },
  "8901491102033": {
    name: "Thums Up Soft Drink Pet Bottle 1.25L",
    brand: "Thums Up",
    description: "Thums Up Cola Beverage Family Pack 1.25 Litre Bottle",
    category: "Beverages",
    uom: "PCS",
    hsnCode: "22021010",
    gstRate: "28",
  },
  "8901491102040": {
    name: "Thums Up Soft Drink Pet Bottle 2L",
    brand: "Thums Up",
    description: "Thums Up Cola Beverage Party Size 2 Litre Bottle",
    category: "Beverages",
    uom: "PCS",
    hsnCode: "22021010",
    gstRate: "28",
  },
  "8901491102057": {
    name: "Thums Up Soft Drink Sleek Can 300ml",
    brand: "Thums Up",
    description: "Thums Up Strong Taste Cola Aluminium Can (300ml)",
    category: "Beverages",
    uom: "PCS",
    hsnCode: "22021010",
    gstRate: "28",
  },
  "8901491101012": {
    name: "Coca-Cola Original Taste Soft Drink Pet Bottle 750ml",
    brand: "Coca-Cola",
    description: "Coca-Cola Carbonated Beverage 750ml Pet Bottle",
    category: "Beverages",
    uom: "PCS",
    hsnCode: "22021010",
    gstRate: "28",
  },
  "8901491101029": {
    name: "Coca-Cola Soft Drink Pet Bottle 600ml",
    brand: "Coca-Cola",
    description: "Coca-Cola Refreshing Carbonated Drink 600ml Bottle",
    category: "Beverages",
    uom: "PCS",
    hsnCode: "22021010",
    gstRate: "28",
  },
  "8901491103016": {
    name: "Sprite Lemon-Lime Soft Drink Pet Bottle 750ml",
    brand: "Sprite",
    description: "Sprite Clear Lemon-Lime Carbonated Drink 750ml Bottle",
    category: "Beverages",
    uom: "PCS",
    hsnCode: "22021010",
    gstRate: "28",
  },
  "8901491104013": {
    name: "Fanta Orange Flavour Soft Drink Pet Bottle 750ml",
    brand: "Fanta",
    description: "Fanta Bright Orange Carbonated Soft Drink 750ml Bottle",
    category: "Beverages",
    uom: "PCS",
    hsnCode: "22021010",
    gstRate: "28",
  },
  "8901491105010": {
    name: "Limca Lemoni Fizzy Soft Drink Pet Bottle 750ml",
    brand: "Limca",
    description: "Limca Cloudy Lemon Flavoured Carbonated Drink 750ml Bottle",
    category: "Beverages",
    uom: "PCS",
    hsnCode: "22021010",
    gstRate: "28",
  },
  "8901491106017": {
    name: "Maaza Mango Drink Pet Bottle 600ml",
    brand: "Maaza",
    description: "Maaza Real Alphonso Mango Pulp Beverage 600ml Bottle",
    category: "Beverages",
    uom: "PCS",
    hsnCode: "22029920",
    gstRate: "12",
  },
  "8901491106024": {
    name: "Maaza Mango Drink Pet Bottle 1.2L",
    brand: "Maaza",
    description: "Maaza Real Mango Pulp Beverage Family Pack 1.2 Litre Bottle",
    category: "Beverages",
    uom: "PCS",
    hsnCode: "22029920",
    gstRate: "12",
  },
  "8901725001018": {
    name: "Frooti Fresh 'N' Juicy Mango Drink 125ml Tetra",
    brand: "Frooti",
    description: "Frooti Mango Drink Pocket Tetra Pak with Straw (125ml)",
    category: "Beverages",
    uom: "PCS",
    hsnCode: "22029920",
    gstRate: "12",
  },
  "8901725001025": {
    name: "Frooti Fresh 'N' Juicy Mango Drink 200ml Tetra",
    brand: "Frooti",
    description: "Frooti Mango Drink Classic Tetra Pak with Straw (200ml)",
    category: "Beverages",
    uom: "PCS",
    hsnCode: "22029920",
    gstRate: "12",
  },
  "8901725001032": {
    name: "Frooti Mango Drink Pet Bottle 600ml",
    brand: "Frooti",
    description: "Frooti Real Mango Beverage 600ml Bottle",
    category: "Beverages",
    uom: "PCS",
    hsnCode: "22029920",
    gstRate: "12",
  },
  "8901725002015": {
    name: "Appy Fizz Sparkling Apple Juice Drink 250ml Pet Bottle",
    brand: "Appy Fizz",
    description: "Parle Agro Appy Fizz Sparkling Apple Beverage (250ml)",
    category: "Beverages",
    uom: "PCS",
    hsnCode: "22029920",
    gstRate: "12",
  },
  "8901725002022": {
    name: "Appy Fizz Sparkling Apple Juice Drink 600ml Pet Bottle",
    brand: "Appy Fizz",
    description: "Parle Agro Appy Fizz Sparkling Apple Juice Drink (600ml)",
    category: "Beverages",
    uom: "PCS",
    hsnCode: "22029920",
    gstRate: "12",
  },
  "8901138510013": {
    name: "Pepsi Cola Carbonated Soft Drink 750ml Bottle",
    brand: "Pepsi",
    description: "Pepsi Carbonated Soft Drink Pet Bottle 750ml",
    category: "Beverages",
    uom: "PCS",
    hsnCode: "22021010",
    gstRate: "28",
  },
  "8901138520012": {
    name: "Mountain Dew Citrus Soft Drink Pet Bottle 750ml",
    brand: "Mountain Dew",
    description: "Mountain Dew High Voltage Citrus Flavoured Drink 750ml",
    category: "Beverages",
    uom: "PCS",
    hsnCode: "22021010",
    gstRate: "28",
  },
  "8901138530011": {
    name: "7UP Lemon Lime Soft Drink Pet Bottle 750ml",
    brand: "7UP",
    description: "7UP Crisp Lemon Lime Flavoured Carbonated Drink 750ml",
    category: "Beverages",
    uom: "PCS",
    hsnCode: "22021010",
    gstRate: "28",
  },
  "8901138550019": {
    name: "Sting Energy Drink Pet Bottle 250ml",
    brand: "Sting",
    description: "Sting Caffeinated Energy Beverage Red Rush 250ml Pet Bottle",
    category: "Beverages",
    uom: "PCS",
    hsnCode: "22029990",
    gstRate: "28",
  },
  "9002490100070": {
    name: "Red Bull Energy Drink 250ml Can",
    brand: "Red Bull",
    description: "Red Bull Original Caffeinated Taurine Energy Drink Aluminium Can (250ml)",
    category: "Beverages",
    uom: "PCS",
    hsnCode: "22029990",
    gstRate: "28",
  },

  // --- PACKAGED SNACKS & CHIPS ---
  "8901138710017": {
    name: "Kurkure Masala Munch Crispy Namkeen 82g",
    brand: "Kurkure",
    description: "Kurkure Masala Munch Crunchy Spiced Corn Puffs (82g)",
    category: "Packaged Snacks",
    uom: "PACK",
    hsnCode: "19059040",
    gstRate: "12",
  },
  "8901138710024": {
    name: "Kurkure Masala Munch Crispy Namkeen 140g Family Pack",
    brand: "Kurkure",
    description: "Kurkure Masala Munch Crunchy Spiced Corn Puffs (140g)",
    category: "Packaged Snacks",
    uom: "PACK",
    hsnCode: "19059040",
    gstRate: "12",
  },
  "8901138720016": {
    name: "Lay's India's Magic Masala Potato Chips 50g",
    brand: "Lay's",
    description: "Lay's Classic Crispy Potato Chips India's Magic Masala (50g)",
    category: "Packaged Snacks",
    uom: "PACK",
    hsnCode: "19059040",
    gstRate: "12",
  },
  "8901138720023": {
    name: "Lay's Classic Salted Potato Chips 50g",
    brand: "Lay's",
    description: "Lay's Classic Salted Thin Crispy Potato Chips (50g)",
    category: "Packaged Snacks",
    uom: "PACK",
    hsnCode: "19059040",
    gstRate: "12",
  },
  "8901138720030": {
    name: "Lay's American Style Cream & Onion Chips 50g",
    brand: "Lay's",
    description: "Lay's American Style Cream and Herb Onion Potato Chips (50g)",
    category: "Packaged Snacks",
    uom: "PACK",
    hsnCode: "19059040",
    gstRate: "12",
  },
  "8901138720047": {
    name: "Lay's Spanish Tomato Tango Potato Chips 50g",
    brand: "Lay's",
    description: "Lay's Sweet & Tangy Spanish Tomato Tango Chips (50g)",
    category: "Packaged Snacks",
    uom: "PACK",
    hsnCode: "19059040",
    gstRate: "12",
  },
};

interface Gs1ManufacturerPrefix {
  manufacturer: string;
  brand: string;
  category: string;
  defaultHsn: string;
  defaultGst: string;
  defaultUom: string;
}

/** Comprehensive GS1 India (Prefix 890) Manufacturer Prefix Registry */
const GS1_INDIA_PREFIX_MAP: Record<string, Gs1ManufacturerPrefix> = {
  // 7-digit prefixes
  "8901030": {
    manufacturer: "Hindustan Unilever Limited",
    brand: "HUL",
    category: "Personal Care & Home Care",
    defaultHsn: "34011110",
    defaultGst: "18",
    defaultUom: "PCS",
  },
  "8901058": {
    manufacturer: "Nestlé India Limited",
    brand: "Nestlé",
    category: "Packaged Foods & Beverages",
    defaultHsn: "19023010",
    defaultGst: "12",
    defaultUom: "PACK",
  },
  "8901052": {
    manufacturer: "Tata Consumer Products Limited",
    brand: "Tata",
    category: "Grocery & Beverages",
    defaultHsn: "09024020",
    defaultGst: "5",
    defaultUom: "PACK",
  },
  "8901719": {
    manufacturer: "Parle Products Private Limited",
    brand: "Parle",
    category: "Bakery & Biscuits",
    defaultHsn: "19053100",
    defaultGst: "18",
    defaultUom: "PACK",
  },
  "8901063": {
    manufacturer: "Britannia Industries Limited",
    brand: "Britannia",
    category: "Bakery & Biscuits",
    defaultHsn: "19053100",
    defaultGst: "18",
    defaultUom: "PACK",
  },
  "8901499": {
    manufacturer: "ITC Limited",
    brand: "ITC",
    category: "Packaged Goods & Staples",
    defaultHsn: "11010000",
    defaultGst: "5",
    defaultUom: "PACK",
  },
  "8906001": {
    manufacturer: "Gujarat Co-operative Milk Marketing Federation (Amul)",
    brand: "Amul",
    category: "Dairy Products",
    defaultHsn: "04051000",
    defaultGst: "12",
    defaultUom: "PACK",
  },
  "8906007": {
    manufacturer: "Amul Dairy Products (GCMMF)",
    brand: "Amul",
    category: "Dairy Products",
    defaultHsn: "04011000",
    defaultGst: "5",
    defaultUom: "PCS",
  },
  "8906010": {
    manufacturer: "Adani Wilmar Limited",
    brand: "Fortune",
    category: "Edible Oils & Staples",
    defaultHsn: "15121910",
    defaultGst: "5",
    defaultUom: "PACK",
  },
  "8906020": {
    manufacturer: "KRBL Limited",
    brand: "India Gate",
    category: "Grains & Rice",
    defaultHsn: "10063020",
    defaultGst: "5",
    defaultUom: "BAG",
  },
  "8906079": {
    manufacturer: "LT Foods Limited",
    brand: "Daawat",
    category: "Grains & Rice",
    defaultHsn: "10063020",
    defaultGst: "5",
    defaultUom: "BAG",
  },
  "8901262": {
    manufacturer: "Marico Limited",
    brand: "Marico",
    category: "Personal Care & Edible Oils",
    defaultHsn: "15131900",
    defaultGst: "5",
    defaultUom: "PCS",
  },
  "8901207": {
    manufacturer: "Dabur India Limited",
    brand: "Dabur",
    category: "Healthcare & Ayurvedic",
    defaultHsn: "30049011",
    defaultGst: "12",
    defaultUom: "PCS",
  },
  "8902579": {
    manufacturer: "Patanjali Ayurved Limited",
    brand: "Patanjali",
    category: "Ayurvedic & Staples",
    defaultHsn: "04059020",
    defaultGst: "12",
    defaultUom: "PCS",
  },
  "8901725": {
    manufacturer: "Haldiram Foods International",
    brand: "Haldiram's",
    category: "Snacks & Sweets",
    defaultHsn: "21069099",
    defaultGst: "12",
    defaultUom: "PACK",
  },
  "8906005": {
    manufacturer: "Everest Food Products Private Limited",
    brand: "Everest",
    category: "Spices & Seasonings",
    defaultHsn: "09109100",
    defaultGst: "5",
    defaultUom: "PACK",
  },
  "8901387": {
    manufacturer: "Mahashian Di Hatti Private Limited (MDH)",
    brand: "MDH",
    category: "Spices & Seasonings",
    defaultHsn: "09109100",
    defaultGst: "5",
    defaultUom: "PACK",
  },
  "8906014": {
    manufacturer: "Dharampal Satyapal Limited (DS Group)",
    brand: "Catch",
    category: "Spices & Seasonings",
    defaultHsn: "25010010",
    defaultGst: "5",
    defaultUom: "PCS",
  },
  "8901012": {
    manufacturer: "Colgate-Palmolive (India) Limited",
    brand: "Colgate",
    category: "Personal Care & Oral Care",
    defaultHsn: "33061020",
    defaultGst: "18",
    defaultUom: "PCS",
  },
  "8901023": {
    manufacturer: "Reckitt Benckiser (India) Limited",
    brand: "Dettol / Reckitt",
    category: "Hygiene & Home Care",
    defaultHsn: "34011110",
    defaultGst: "18",
    defaultUom: "PCS",
  },
  "8901088": {
    manufacturer: "Procter & Gamble Home Products",
    brand: "P&G",
    category: "Home & Personal Care",
    defaultHsn: "34029099",
    defaultGst: "18",
    defaultUom: "PACK",
  },
  "8901233": {
    manufacturer: "Mondelez India Foods Private Limited",
    brand: "Cadbury",
    category: "Confectionery & Chocolates",
    defaultHsn: "18063200",
    defaultGst: "18",
    defaultUom: "PCS",
  },
  "8901764": {
    manufacturer: "Godrej Consumer Products Limited",
    brand: "Godrej",
    category: "Home & Personal Care",
    defaultHsn: "38089191",
    defaultGst: "18",
    defaultUom: "PCS",
  },
  "8901314": {
    manufacturer: "Emami Limited",
    brand: "Emami",
    category: "Personal Care & Healthcare",
    defaultHsn: "30049089",
    defaultGst: "12",
    defaultUom: "PCS",
  },
  "8904004": {
    manufacturer: "Himalaya Wellness Company",
    brand: "Himalaya",
    category: "Personal Care & Wellness",
    defaultHsn: "34013000",
    defaultGst: "18",
    defaultUom: "PCS",
  },
  "8901022": {
    manufacturer: "Wipro Enterprises Private Limited",
    brand: "Wipro",
    category: "Personal Care & Soap",
    defaultHsn: "34011110",
    defaultGst: "18",
    defaultUom: "PCS",
  },
  "8901015": {
    manufacturer: "Pidilite Industries Limited",
    brand: "Pidilite",
    category: "Stationery & Adhesives",
    defaultHsn: "35061000",
    defaultGst: "18",
    defaultUom: "PCS",
  },
  "8901138": {
    manufacturer: "PepsiCo India Holdings Private Limited",
    brand: "PepsiCo",
    category: "Packaged Snacks & Beverages",
    defaultHsn: "19059040",
    defaultGst: "12",
    defaultUom: "PACK",
  },
  "8901491": {
    manufacturer: "Coca-Cola India Private Limited",
    brand: "Coca-Cola",
    category: "Beverages",
    defaultHsn: "22021010",
    defaultGst: "28",
    defaultUom: "PCS",
  },
  "8901648": {
    manufacturer: "Mother Dairy Fruit & Vegetable",
    brand: "Mother Dairy",
    category: "Dairy Products",
    defaultHsn: "04012000",
    defaultGst: "5",
    defaultUom: "PACK",
  },
  "8901844": {
    manufacturer: "Bikaji Foods International Limited",
    brand: "Bikaji",
    category: "Packaged Snacks",
    defaultHsn: "21069099",
    defaultGst: "12",
    defaultUom: "PACK",
  },
  "8901512": {
    manufacturer: "Bikanervala Foods Private Limited",
    brand: "Bikano",
    category: "Packaged Snacks",
    defaultHsn: "21069099",
    defaultGst: "12",
    defaultUom: "PACK",
  },
  "8902080": {
    manufacturer: "MTR Foods Private Limited",
    brand: "MTR",
    category: "Instant Foods & Packaged Goods",
    defaultHsn: "21069099",
    defaultGst: "12",
    defaultUom: "PACK",
  },
  "8901582": {
    manufacturer: "Balaji Wafers Private Limited",
    brand: "Balaji",
    category: "Packaged Snacks",
    defaultHsn: "19059040",
    defaultGst: "12",
    defaultUom: "PACK",
  },
  "8904153": {
    manufacturer: "Hector Beverages Private Limited",
    brand: "Paper Boat",
    category: "Beverages",
    defaultHsn: "22029920",
    defaultGst: "12",
    defaultUom: "PCS",
  },
  "8906018": {
    manufacturer: "Hamdard Laboratories India",
    brand: "Hamdard",
    category: "Beverages & Ayurvedic",
    defaultHsn: "21069019",
    defaultGst: "18",
    defaultUom: "PCS",
  },
  "8901034": {
    manufacturer: "Asian Paints Limited",
    brand: "Asian Paints",
    category: "Paints & Coatings",
    defaultHsn: "32091090",
    defaultGst: "18",
    defaultUom: "CAN",
  },
  "8901525": {
    manufacturer: "Raymond Limited",
    brand: "Raymond",
    category: "Textiles & Apparel",
    defaultHsn: "55151100",
    defaultGst: "5",
    defaultUom: "MTR",
  },
  "8901067": {
    manufacturer: "Bata India Limited",
    brand: "Bata",
    category: "Footwear",
    defaultHsn: "64041990",
    defaultGst: "12",
    defaultUom: "PAIR",
  },
  "8906003": {
    manufacturer: "Bisleri International Private Limited",
    brand: "Bisleri",
    category: "Packaged Drinking Water & Beverages",
    defaultHsn: "22011010",
    defaultGst: "18",
    defaultUom: "PCS",
  },
  "8901416": {
    manufacturer: "Karnataka Soaps and Detergents Limited",
    brand: "Mysore Sandal",
    category: "Personal Care & Bathing",
    defaultHsn: "34011110",
    defaultGst: "18",
    defaultUom: "PCS",
  },
  "8904018": {
    manufacturer: "Cholayil Private Limited",
    brand: "Medimix",
    category: "Personal Care & Bathing",
    defaultHsn: "34011110",
    defaultGst: "18",
    defaultUom: "PCS",
  },
  "8908006": {
    manufacturer: "Cholayil Private Limited",
    brand: "Medimix",
    category: "Personal Care & Bathing",
    defaultHsn: "34011110",
    defaultGst: "18",
    defaultUom: "PCS",
  },
  "8904052": {
    manufacturer: "Nivea India Private Limited",
    brand: "Nivea",
    category: "Personal Care & Skin Care",
    defaultHsn: "33049990",
    defaultGst: "18",
    defaultUom: "PCS",
  },
  "8901323": {
    manufacturer: "GD Pharmaceuticals Private Limited",
    brand: "Boroline",
    category: "Personal Care & Skin Care",
    defaultHsn: "30049089",
    defaultGst: "12",
    defaultUom: "PCS",
  },
  "8901288": {
    manufacturer: "Vicco Laboratories",
    brand: "Vicco",
    category: "Personal Care & Skin Care",
    defaultHsn: "30049011",
    defaultGst: "12",
    defaultUom: "PCS",
  },
  "89060074": {
    manufacturer: "RSH Global Private Limited (Joy Personal Care)",
    brand: "Joy",
    category: "Personal Care & Skin Care",
    defaultHsn: "33049990",
    defaultGst: "18",
    defaultUom: "PCS",
  },
  "8901526": {
    manufacturer: "L'Oréal India Private Limited",
    brand: "L'Oréal",
    category: "Personal Care & Hair Care",
    defaultHsn: "33051090",
    defaultGst: "18",
    defaultUom: "PCS",
  },
  "8908000": {
    manufacturer: "Indian Railway Catering and Tourism Corporation (IRCTC)",
    brand: "Rail Neer",
    category: "Packaged Drinking Water & Beverages",
    defaultHsn: "22011010",
    defaultGst: "18",
    defaultUom: "PCS",
  },
};

/** Match GS1 India Manufacturer Prefix (7-digit or 8-digit) */
function lookupGs1Prefix(barcode: string): Gs1ManufacturerPrefix | null {
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

/** Queries public Open Food Facts & Open Beauty Facts registries with error-safe parsing */
async function fetchFromOpenRegistry(barcode: string): Promise<{
  name?: string;
  brand?: string;
  description?: string;
  category?: string;
  uom?: string;
} | null> {
  const endpoints = [
    `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json`,
    `https://world.openbeautyfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json`,
  ];

  for (const url of endpoints) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "MargixIMS/1.0 (inventory@margixindia.com)" },
        signal: AbortSignal.timeout(3000),
      });

      if (!res.ok) continue;

      const contentType = res.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) {
        // Skip rate-limit HTML error pages (e.g. 503 Cloudflare pages)
        continue;
      }

      const raw = await res.text();
      let data: { status?: number; product?: Record<string, unknown> };
      try {
        data = JSON.parse(raw);
      } catch {
        continue;
      }

      if (data.status === 1 && data.product) {
        const p = data.product;
        const rawName =
          (p.product_name_en as string) ||
          (p.product_name as string) ||
          (p.generic_name as string) ||
          (p.generic_name_en as string);
        const brand = (p.brands as string) || undefined;
        const quantity = (p.quantity as string) || undefined;
        const categories = (p.categories as string) || undefined;

        if (rawName && typeof rawName === "string" && rawName.trim()) {
          const cleanName = rawName.trim();
          const fullName =
            brand && !cleanName.toLowerCase().includes(brand.toLowerCase()) ? `${brand} ${cleanName}` : cleanName;
          const uomMatch = quantity
            ? quantity.match(/\b(kg|gm?|g|ltr?|l|ml|pcs|pack|can|jar|tin)\b/i)?.[0].toUpperCase()
            : undefined;

          let categoryName: string | undefined;
          if (categories && typeof categories === "string") {
            const split = categories.split(",");
            const last = split[split.length - 1]?.trim();
            if (last) {
              categoryName = cleanCategoryName(last);
            }
          }

          return {
            name: cleanCommercialProductName(fullName, brand),
            brand,
            description: quantity ? `${fullName} (${quantity})` : fullName,
            category: categoryName,
            uom: uomMatch,
          };
        }
      }
    } catch {
      // Continue to next endpoint or fallback
    }
  }

  return null;
}

/** Queries LLM to identify commodity and product details from barcode and trade conventions */
async function identifyWithLlm(
  barcode: string,
  prefixHint?: Gs1ManufacturerPrefix | null,
): Promise<{
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
    const hintText = prefixHint
      ? `\nVerified GS1 India Registry Context: This barcode prefix is registered to manufacturer: "${prefixHint.manufacturer}", Brand: "${prefixHint.brand}", Common Category: "${prefixHint.category}".`
      : isIndian
        ? "\nNote: Prefix 890 indicates GS1 India (Indian FMCG, grocery, packaged food, personal care, or agricultural commodity)."
        : "";

    const prompt = `Identify the commercial product or agricultural commodity for barcode "${barcode}".${hintText}
If you recognize the specific product variant, return its accurate commercial name, brand, standard pack/size, HSN code, and GST rate.
If the exact variant is uncertain, use the manufacturer brand and product category context to infer realistic commercial metadata.
Respond strictly in JSON with these keys:
{
  "name": "Commercial Product Name with Pack/Size if applicable",
  "brand": "Brand Name or Manufacturer",
  "description": "Short product description",
  "category": "Broad category (e.g. Grains & Pulses, Edible Oils, Spices & Seasonings, Packaged Foods, Personal Care, Dairy Products)",
  "uom": "Standard Unit (e.g. KG, GM, LTR, PCS, PACK, BOX, BAG)",
  "hsnCode": "HSN Code (4 to 8 digits)",
  "gstRate": "GST Rate percentage (e.g. 0, 5, 12, 18)"
}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
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
            name: cleanCommercialProductName(parsed.name.trim(), brand),
            brand,
            description: parsed.description ? String(parsed.description).trim() : undefined,
            category: parsed.category ? cleanCategoryName(String(parsed.category)) : prefixHint?.category,
            uom: parsed.uom ? String(parsed.uom).trim() : prefixHint?.defaultUom,
            hsnCode: parsed.hsnCode ? String(parsed.hsnCode).replace(/\D/g, "") : prefixHint?.defaultHsn,
            gstRate:
              parsed.gstRate !== undefined
                ? String(parsed.gstRate).replace("%", "").trim()
                : prefixHint?.defaultGst,
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

/** Looks up barcode in internal database first, then exact catalog, open registries, and AI */
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

  // 3. Fast-Path: Curated Exact GTIN Catalog (instant match, zero latency, 100% accuracy)
  const curatedMatch = CURATED_GTIN_CATALOG[barcode];
  if (curatedMatch) {
    const matchedCategoryId = resolveOrMatchCategory(curatedMatch.category, curatedMatch.hsnCode, categories);
    const matchedUomId = resolveUom(curatedMatch.uom, uoms);

    return {
      barcode,
      foundInDatabase: false,
      catalogDetails: {
        name: curatedMatch.name,
        brand: curatedMatch.brand,
        description: curatedMatch.description,
        suggestedCategoryId: matchedCategoryId?.id,
        suggestedCategoryName: matchedCategoryId?.name || curatedMatch.category,
        suggestedBaseUomId: matchedUomId?.id,
        suggestedUomCode: matchedUomId?.code || curatedMatch.uom,
        suggestedHsnCode: curatedMatch.hsnCode,
        suggestedGstRate: curatedMatch.gstRate,
        confidence: "high",
        source: "local",
      },
    };
  }

  // 4. GS1 India Manufacturer Prefix check
  const gs1PrefixInfo = lookupGs1Prefix(barcode);

  // 5. Try Open Registries (Open Food Facts / Open Beauty Facts), then AI
  const registryHit = await fetchFromOpenRegistry(barcode);
  const aiHit = await identifyWithLlm(barcode, gs1PrefixInfo);

  let productName = registryHit?.name || aiHit?.name;
  let brand = registryHit?.brand || aiHit?.brand || gs1PrefixInfo?.brand;
  let description = registryHit?.description || aiHit?.description;
  let suggestedCategoryName = aiHit?.category || registryHit?.category || gs1PrefixInfo?.category;
  let suggestedUomCode = registryHit?.uom || aiHit?.uom || gs1PrefixInfo?.defaultUom;
  let suggestedHsn = aiHit?.hsnCode || gs1PrefixInfo?.defaultHsn;
  let suggestedGst = aiHit?.gstRate || gs1PrefixInfo?.defaultGst;
  let confidence: "high" | "medium" | "low" = registryHit ? "high" : aiHit ? "medium" : gs1PrefixInfo ? "medium" : "low";
  let source: "registry" | "ai" | "inferred" = registryHit ? "registry" : aiHit ? "ai" : "inferred";

  // 6. Inferred fallback if registry and AI return nothing
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

function resolveOrMatchCategory(
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

function resolveUom(
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
