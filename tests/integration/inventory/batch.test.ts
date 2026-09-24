import { describe, expect, it } from "vitest";
import { withTx } from "@/server/db/transaction";
import { AppError } from "@/server/errors";
import { DEFAULT_BATCH_NUMBER, resolveBatch } from "@/server/modules/inventory/batch.service";
import { createSku } from "../../helpers/factories";

const date = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

describe("resolveBatch", () => {
  it("creates a batch once and returns the same row afterwards", async () => {
    const sku = await createSku();
    const first = await withTx((tx) => resolveBatch(tx, sku, { batchNumber: " b-100 " }));
    const second = await withTx((tx) => resolveBatch(tx, sku, { batchNumber: "B-100" }));

    expect(first.batchNumber).toBe("B-100");
    expect(second.id).toBe(first.id);
  });

  it("is safe under concurrent creation", async () => {
    const sku = await createSku();
    const batches = await Promise.all(
      Array.from({ length: 5 }, () => withTx((tx) => resolveBatch(tx, sku, { batchNumber: "B-1" }))),
    );
    expect(new Set(batches.map((b) => b.id)).size).toBe(1);
  });

  it("fills in missing dates but never overwrites recorded ones", async () => {
    const sku = await createSku();
    await withTx((tx) => resolveBatch(tx, sku, { batchNumber: "B-1" }));
    const filled = await withTx((tx) =>
      resolveBatch(tx, sku, { batchNumber: "B-1", expiryDate: date("2027-03-31") }),
    );
    expect(filled.expiryDate?.toISOString()).toBe("2027-03-31T00:00:00.000Z");

    const error = await withTx((tx) =>
      resolveBatch(tx, sku, { batchNumber: "B-1", expiryDate: date("2027-06-30") }),
    ).catch((e: unknown) => e);
    expect((error as AppError).code).toBe("BATCH_MISMATCH");
  });

  it("requires a batch number for batch-tracked SKUs and reserves DEFAULT", async () => {
    const sku = await createSku();
    await expect(withTx((tx) => resolveBatch(tx, sku, {}))).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(
      withTx((tx) => resolveBatch(tx, sku, { batchNumber: "default" })),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("uses the DEFAULT batch for SKUs that are not batch-tracked", async () => {
    const sku = await createSku({ isBatchTracked: false });
    const batch = await withTx((tx) =>
      resolveBatch(tx, sku, { batchNumber: "IGNORED", expiryDate: date("2027-01-01") }),
    );
    expect(batch.batchNumber).toBe(DEFAULT_BATCH_NUMBER);
    expect(batch.expiryDate).toBeNull();
  });
});
