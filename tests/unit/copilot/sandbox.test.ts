import { describe, expect, it } from "vitest";
import { getSandboxStatus } from "@/server/modules/copilot/sandbox.service";

describe("Sandbox Service", () => {
  it("computes sandbox status accurately", async () => {
    const status = await getSandboxStatus();
    expect(status).toHaveProperty("hasDemoData");
    expect(status).toHaveProperty("demoSkuCount");
    expect(status).toHaveProperty("demoPoCount");
    expect(status).toHaveProperty("demoGrnCount");
    expect(status).toHaveProperty("demoInvoiceCount");
    expect(status).toHaveProperty("demoStockBags");
    expect(typeof status.hasDemoData).toBe("boolean");
    expect(typeof status.demoStockBags).toBe("number");
  });
});
