import { describe, expect, it } from "vitest";
import { withTx } from "@/server/db/transaction";
import { nextDocumentNumber } from "@/server/modules/documents/documents.service";

describe("nextDocumentNumber", () => {
  it("issues sequential numbers per prefix and financial year", async () => {
    const date = new Date("2026-09-24T10:00:00Z");
    const a = await withTx((tx) => nextDocumentNumber(tx, "GRN", date));
    const b = await withTx((tx) => nextDocumentNumber(tx, "GRN", date));
    const c = await withTx((tx) => nextDocumentNumber(tx, "PO", date));

    expect([a, b, c]).toEqual(["GRN-2627-00001", "GRN-2627-00002", "PO-2627-00001"]);
  });

  it("is unique and gap-free under concurrency", async () => {
    const numbers = await Promise.all(
      Array.from({ length: 50 }, () => withTx((tx) => nextDocumentNumber(tx, "DSP"))),
    );
    const values = numbers.map((n) => Number(n.split("-")[2])).sort((x, y) => x - y);
    expect(values).toEqual(Array.from({ length: 50 }, (_, i) => i + 1));
  });

  it("does not consume a number when the transaction rolls back", async () => {
    await withTx(async (tx) => {
      await nextDocumentNumber(tx, "ADJ");
      throw new Error("rollback");
    }).catch(() => undefined);

    const next = await withTx((tx) => nextDocumentNumber(tx, "ADJ"));
    expect(next.endsWith("-00001")).toBe(true);
  });
});
