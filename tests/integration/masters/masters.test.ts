import { describe, expect, it } from "vitest";
import { skuUpdateSchema } from "@/lib/validation/masters";
import { prisma } from "@/server/db/client";
import type { AppError } from "@/server/errors";
import { updateGodown, updateSku } from "@/server/modules/masters/masters.service";
import { postOpeningBalance } from "@/server/modules/opening/opening.service";
import { actorFor, createGodown, createHsn, createSku, createUom, createUser } from "../../helpers/factories";

const errorCode = (p: Promise<unknown>) => p.then(() => "OK", (e: AppError) => e.code);

describe("master data rules", () => {
  it("protects stock identity and on-hand stock", async () => {
    const admin = actorFor(await createUser("ADMIN"));
    const sku = await createSku();
    const godown = await createGodown();
    await postOpeningBalance(admin, {
      godownId: godown.id,
      asOf: "2026-04-01",
      items: [{ skuId: sku.id, batchNumber: "B-1", quantity: "5" }],
    });
    const pcs = await createUom("PCS", 0);

    expect(await errorCode(updateSku(admin, sku.id, { isBatchTracked: false }))).toBe("INVALID_STATE");
    expect(await errorCode(updateSku(admin, sku.id, { baseUomId: pcs.id }))).toBe("INVALID_STATE");
    expect(await errorCode(updateSku(admin, sku.id, { status: "ARCHIVED" }))).toBe("INVALID_STATE");
    expect(await errorCode(updateGodown(admin, godown.id, { isActive: false }))).toBe("INVALID_STATE");
    expect(await errorCode(updateSku(admin, sku.id, { status: "INACTIVE", name: "Renamed" }))).toBe("OK");
  });

  it("clears optional fields when an empty value is submitted", async () => {
    const admin = actorFor(await createUser("ADMIN"));
    const sku = await createSku();
    await createHsn("3901");
    await prisma.sku.update({ where: { id: sku.id }, data: { hsnCode: "3901", tallyStockItemName: "Resin" } });

    await updateSku(admin, sku.id, skuUpdateSchema.parse({ hsnCode: "", tallyStockItemName: "" }));

    const after = await prisma.sku.findUniqueOrThrow({ where: { id: sku.id } });
    expect(after.hsnCode).toBeNull();
    expect(after.tallyStockItemName).toBeNull();
    expect(await prisma.auditLog.count({ where: { action: "MASTER_UPDATED", entityId: sku.id } })).toBe(1);
  });
});
