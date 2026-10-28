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

  it("copilot tools include lookup_barcode with correct permissions and schema", async () => {
    const tool = TOOLS.find((t) => t.name === "lookup_barcode");
    expect(tool).toBeDefined();
    expect(tool?.permission).toBe("master.view");

    const execResult = (await tool?.execute({ barcode: "8909876543210" }, { role: "ADMIN", route: "/masters/skus" })) as any;
    expect(execResult).toBeDefined();
    expect(execResult.barcode).toBe("8909876543210");
  });
});

