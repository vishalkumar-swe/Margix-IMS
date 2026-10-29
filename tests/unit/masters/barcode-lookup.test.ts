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

    // Water bottle: Bisleri 1L
    const bisleri = await lookupBarcodeDetails("8906003920042");
    expect(bisleri.catalogDetails?.name).toContain("Bisleri");
    expect(bisleri.catalogDetails?.brand).toBe("Bisleri");
    expect(bisleri.catalogDetails?.suggestedHsnCode).toBe("22011010");
    expect(bisleri.catalogDetails?.suggestedCategoryName).toContain("Water");

    // Soap: Mysore Sandal Soap 75g
    const mysoreSandal = await lookupBarcodeDetails("8901416001018");
    expect(mysoreSandal.catalogDetails?.name).toContain("Mysore Sandal");
    expect(mysoreSandal.catalogDetails?.suggestedHsnCode).toBe("34011110");
    expect(mysoreSandal.catalogDetails?.suggestedCategoryName).toContain("Bathing");

    // Soap: Dettol Original Soap 125g
    const dettolSoap = await lookupBarcodeDetails("8901023011027");
    expect(dettolSoap.catalogDetails?.name).toContain("Dettol");
    expect(dettolSoap.catalogDetails?.suggestedHsnCode).toBe("34011110");

    // Lotion: Vaseline Deep Restore 200ml
    const vaseline = await lookupBarcodeDetails("8901030368123");
    expect(vaseline.catalogDetails?.name).toContain("Vaseline");
    expect(vaseline.catalogDetails?.brand).toBe("Vaseline");
    expect(vaseline.catalogDetails?.suggestedCategoryName).toContain("Skin Care");

    // Lotion: Nivea Body Milk 200ml
    const nivea = await lookupBarcodeDetails("8904052401022");
    expect(nivea.catalogDetails?.name).toContain("Nivea");
    expect(nivea.catalogDetails?.suggestedHsnCode).toBe("33049990");

    // Cold Drink: Thums Up 750ml
    const thumsUp = await lookupBarcodeDetails("8901491102019");
    expect(thumsUp.catalogDetails?.name).toContain("Thums Up");
    expect(thumsUp.catalogDetails?.suggestedGstRate).toBe("28");
  });

  it("identifies manufacturer and brand from GS1 India prefix even when offline", async () => {
    // Barcode with Amul prefix (8906001xxxxxx)
    const amulItem = await lookupBarcodeDetails("8906001999999");
    expect(amulItem.catalogDetails).toBeDefined();
    expect(amulItem.catalogDetails?.brand).toBe("Amul");
    expect(amulItem.catalogDetails?.suggestedCategoryName).toContain("Dairy");

    // Barcode with Bisleri water prefix (8906003xxxxxx)
    const bisleriItem = await lookupBarcodeDetails("8906003888888");
    expect(bisleriItem.catalogDetails).toBeDefined();
    expect(bisleriItem.catalogDetails?.brand).toBe("Bisleri");
    expect(bisleriItem.catalogDetails?.name).toContain("Bisleri Packaged Drinking Water");
    expect(bisleriItem.catalogDetails?.suggestedCategoryName).toContain("Water");

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

