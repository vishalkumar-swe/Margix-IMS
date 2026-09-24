/**
 * Boundary to Tally Prime. Phase 1 ships a deterministic mock; the real XML
 * client implements the same interface in Phase 2.
 */

export type TallyVoucherType = "Receipt Note" | "Delivery Note" | "Stock Journal" | "Physical Stock";

export interface TallyVoucherLine {
  stockItem: string;
  godown: string;
  batch: string;
  /** Signed decimal string: positive = stock in, negative = stock out. */
  quantity: string;
  unit: string;
}

export interface TallyVoucher {
  voucherType: TallyVoucherType;
  voucherNumber: string;
  date: string;
  narration: string;
  lines: TallyVoucherLine[];
}

export type TallyPushResult = { ok: true; voucherId: string } | { ok: false; error: string };

export interface TallyClient {
  push(voucher: TallyVoucher): Promise<TallyPushResult>;
}

/** Always accepts (TALLY_MODE=mock). */
export class MockTallyClient implements TallyClient {
  async push(voucher: TallyVoucher): Promise<TallyPushResult> {
    return { ok: true, voucherId: `MOCK-${voucher.voucherNumber}` };
  }
}

/** Always rejects, simulating an outage (TALLY_MODE=fail). */
export class UnreachableTallyClient implements TallyClient {
  async push(): Promise<TallyPushResult> {
    return { ok: false, error: "Tally Prime is not reachable. The entry will be retried automatically." };
  }
}

/** Returns the configured client, or null when integration is disabled. */
export function createTallyClient(mode: "mock" | "fail" | "disabled"): TallyClient | null {
  switch (mode) {
    case "mock":
      return new MockTallyClient();
    case "fail":
      return new UnreachableTallyClient();
    case "disabled":
      return null;
  }
}
