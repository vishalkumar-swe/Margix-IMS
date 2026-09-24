import type { Env } from "@/server/config/env";
import { buildVoucherImportXml, parseImportResponse } from "./tally-xml";

/**
 * Boundary to Tally Prime. `TALLY_MODE` selects the implementation:
 * mock (always accepts), fail (simulated outage), xml (real Tally HTTP/XML
 * server) or disabled.
 */

export type TallyVoucherType = "Stock Journal";

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
  /** Connectivity check with no side effects (nothing is posted to Tally). */
  ping(): Promise<{ ok: boolean; message: string }>;
}

/** Always accepts (TALLY_MODE=mock). */
export class MockTallyClient implements TallyClient {
  async push(voucher: TallyVoucher): Promise<TallyPushResult> {
    return { ok: true, voucherId: `MOCK-${voucher.voucherNumber}` };
  }

  async ping() {
    return { ok: true, message: "Mock mode: vouchers are accepted without contacting Tally." };
  }
}

/** Always rejects, simulating an outage (TALLY_MODE=fail). */
export class UnreachableTallyClient implements TallyClient {
  async push(): Promise<TallyPushResult> {
    return { ok: false, error: "Tally Prime is not reachable. The entry will be retried automatically." };
  }

  async ping() {
    return { ok: false, message: "Simulated outage (TALLY_MODE=fail)." };
  }
}

/** Posts vouchers to Tally Prime's HTTP/XML server (TALLY_MODE=xml). */
export class XmlTallyClient implements TallyClient {
  constructor(
    private readonly options: { url: string; company: string; timeoutMs: number },
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async push(voucher: TallyVoucher): Promise<TallyPushResult> {
    let response: Response;
    try {
      response = await this.fetchImpl(this.options.url, {
        method: "POST",
        headers: { "content-type": "text/xml; charset=utf-8" },
        body: buildVoucherImportXml(voucher, this.options.company),
        signal: AbortSignal.timeout(this.options.timeoutMs),
      });
    } catch (error) {
      const timedOut = error instanceof DOMException && error.name === "TimeoutError";
      return {
        ok: false,
        error: timedOut
          ? `Tally Prime did not respond within ${Math.round(this.options.timeoutMs / 1000)} seconds.`
          : `Tally Prime is not reachable at ${this.options.url}.`,
      };
    }
    if (!response.ok) return { ok: false, error: `Tally Prime returned HTTP ${response.status}.` };
    return parseImportResponse(await response.text());
  }

  /** Tally Prime's HTTP server answers a plain GET with "TallyPrime Server is Running". */
  async ping() {
    try {
      const response = await this.fetchImpl(this.options.url, { signal: AbortSignal.timeout(this.options.timeoutMs) });
      const text = await response.text();
      return /server is running/i.test(text)
        ? { ok: true, message: `Tally Prime is running at ${this.options.url} (company "${this.options.company}").` }
        : { ok: false, message: `${this.options.url} answered, but not like Tally Prime (HTTP ${response.status}).` };
    } catch {
      return { ok: false, message: `Tally Prime is not reachable at ${this.options.url}.` };
    }
  }
}

/** Returns the configured client, or null when integration is disabled. */
export function createTallyClient(env: Pick<Env, "TALLY_MODE" | "TALLY_URL" | "TALLY_COMPANY" | "TALLY_TIMEOUT_MS">): TallyClient | null {
  switch (env.TALLY_MODE) {
    case "mock":
      return new MockTallyClient();
    case "fail":
      return new UnreachableTallyClient();
    case "xml":
      return new XmlTallyClient({ url: env.TALLY_URL, company: env.TALLY_COMPANY!, timeoutMs: env.TALLY_TIMEOUT_MS });
    case "disabled":
      return null;
  }
}
