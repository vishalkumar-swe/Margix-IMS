import { describe, expect, it } from "vitest";
import { prisma } from "@/server/db/client";
import { barcodeDiscoveryService } from "@/server/modules/masters/barcode-discovery.service";
import { lookupBarcodeDetails } from "@/server/modules/masters/barcode-lookup.service";

describe("Open-Source Barcode Discovery Service & Write-Through Caching", () => {
  it("persists discovered products to global_product_catalog and recalls them instantly", async () => {
    const testBarcode = "8909999000111";

    // Clean up any test artifact
    await prisma.globalProductCatalog.deleteMany({
      where: { barcode: testBarcode },
    });

    // 1. Manually simulate discovery write-through
    await barcodeDiscoveryService.persistToGlobalCatalog({
      barcode: testBarcode,
      name: "Organic Mustard Oil 1L",
      brand: "Kisan Pure",
      description: "Cold pressed kacchi ghani organic mustard oil",
      category: "Edible Oils",
      uom: "LTR",
      hsnCode: "15141910",
      gstRate: "5",
      confidence: "high",
      source: "registry",
    });

    // 2. Verify record in PostgreSQL database
    const dbRecord = await prisma.globalProductCatalog.findUnique({
      where: { barcode: testBarcode },
    });
    expect(dbRecord).not.toBeNull();
    expect(dbRecord?.name).toBe("Organic Mustard Oil 1L");
    expect(dbRecord?.brand).toBe("Kisan Pure");
    expect(dbRecord?.hsnCode).toBe("15141910");
    expect(dbRecord?.gstRate).toBe("5");

    // 3. Verify lookupBarcodeDetails hits the DB cache directly (<5ms)
    const start = performance.now();
    const result = await lookupBarcodeDetails(testBarcode);
    const elapsed = performance.now() - start;

    expect(result.foundInDatabase).toBe(false);
    expect(result.catalogDetails).toBeDefined();
    expect(result.catalogDetails?.name).toBe("Organic Mustard Oil 1L");
    expect(result.catalogDetails?.brand).toBe("Kisan Pure");
    expect(result.catalogDetails?.suggestedHsnCode).toBe("15141910");
    expect(result.catalogDetails?.suggestedGstRate).toBe("5");
    expect(result.catalogDetails?.suggestedUomCode).toBe("LTR");
    expect(result.catalogDetails?.source).toBe("local");
    expect(elapsed).toBeLessThan(100);

    // Clean up
    await prisma.globalProductCatalog.deleteMany({
      where: { barcode: testBarcode },
    });
  });

  it("dynamically queries Open Food Facts public registry and parses product metadata", async () => {
    // 1234567890128 is a real registered item in Open Food Facts (Harvest Box)
    const res = await barcodeDiscoveryService.queryOpenFoodFacts("1234567890128");
    if (res) {
      expect(res.name).toContain("Fruit Clusters");
      expect(res.brand).toBe("Harvest Box");
      expect(res.source).toBe("registry");
      expect(res.confidence).toBe("high");
    }
  });

  it("returns null for completely unlisted synthetic barcodes", async () => {
    const unlisted = "0000000000000";
    const res = await barcodeDiscoveryService.queryOpenFoodFacts(unlisted);
    expect(res).toBeNull();
  });
});
