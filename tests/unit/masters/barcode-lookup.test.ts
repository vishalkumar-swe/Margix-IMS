import { describe, expect, it } from "vitest";
import { lookupBarcodeDetails } from "@/server/modules/masters/barcode-lookup.service";
import { TOOLS } from "@/server/modules/copilot/tools";

describe("Barcode Intelligence Lookup", () => {
  it("handles empty or whitespace barcodes gracefully", async () => {
    const res = await lookupBarcodeDetails("   ");
    expect(res.barcode).toBe("");
    expect(res.foundInDatabase).toBe(false);
  });

  it("infers standard details for unregistered GS1 India barcodes", async () => {
    const res = await lookupBarcodeDetails("8901234567890");
    expect(res.barcode).toBe("8901234567890");
    expect(res.foundInDatabase).toBe(false);
    expect(res.catalogDetails).toBeDefined();
    expect(res.catalogDetails?.name).toBeTruthy();
    expect(res.catalogDetails?.suggestedUomCode).toBeTruthy();
  });

  it("recognizes curated Indian FMCG products with instant high confidence", async () => {
    // Maggi 2-Minute Masala Noodles 70g
    const maggi = await lookupBarcodeDetails("8901058862492");
    expect(maggi.foundInDatabase).toBe(false);
    expect(maggi.catalogDetails).toBeDefined();
    expect(maggi.catalogDetails?.name).toContain("Maggi");
    expect(maggi.catalogDetails?.brand).toBe("Nestlé");
    expect(maggi.catalogDetails?.suggestedHsnCode).toBe("19023010");
    expect(maggi.catalogDetails?.suggestedGstRate).toBe("12");
    expect(maggi.catalogDetails?.suggestedUomCode).toBe("PACK");
    expect(maggi.catalogDetails?.confidence).toBe("high");

    // Tata Salt 1kg
    const tataSalt = await lookupBarcodeDetails("8901052000516");
    expect(tataSalt.catalogDetails?.name).toContain("Tata Salt");
    expect(tataSalt.catalogDetails?.suggestedHsnCode).toBe("25010010");
    expect(tataSalt.catalogDetails?.suggestedGstRate).toBe("0");

    // Parle-G
    const parleG = await lookupBarcodeDetails("8901719101038");
    expect(parleG.catalogDetails?.name).toContain("Parle-G");
    expect(parleG.catalogDetails?.brand).toBe("Parle");
    expect(parleG.catalogDetails?.suggestedHsnCode).toBe("19053100");
  });

  it("identifies manufacturer and brand from GS1 India prefix even when offline", async () => {
    // Barcode with Amul prefix (8906001xxxxxx)
    const amulItem = await lookupBarcodeDetails("8906001999999");
    expect(amulItem.catalogDetails).toBeDefined();
    expect(amulItem.catalogDetails?.brand).toBe("Amul");
    expect(amulItem.catalogDetails?.suggestedCategoryName).toContain("Dairy");

    // Barcode with HUL prefix (8901030xxxxxx)
    const hulItem = await lookupBarcodeDetails("8901030999999");
    expect(hulItem.catalogDetails).toBeDefined();
    expect(hulItem.catalogDetails?.brand).toBe("HUL");
  });

  it("copilot tools include lookup_barcode with correct permissions and schema", async () => {
    const tool = TOOLS.find((t) => t.name === "lookup_barcode");
    expect(tool).toBeDefined();
    expect(tool?.permission).toBe("master.view");

    const execResult = (await tool?.execute({ barcode: "8909876543210" }, { role: "ADMIN", route: "/masters/skus" })) as any;
    expect(execResult).toBeDefined();
    expect(execResult.barcode).toBe("8909876543210");
  });
});

