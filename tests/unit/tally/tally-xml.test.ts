import { describe, expect, it } from "vitest";
import type { TallyVoucher } from "@/server/modules/tally/tally-client";
import { XmlTallyClient } from "@/server/modules/tally/tally-client";
import { buildVoucherImportXml, escapeXml, parseImportResponse } from "@/server/modules/tally/tally-xml";

const voucher: TallyVoucher = {
  voucherType: "Stock Journal",
  voucherNumber: "TRF-2627-00001",
  date: "2026-09-24",
  narration: "Margix TRF-2627-00001 <A&B>",
  lines: [
    { stockItem: "Resin & Co", godown: "Main Location", batch: "B-1", quantity: "-30", unit: "KG" },
    { stockItem: "Resin & Co", godown: "RM Store", batch: "B-1", quantity: "30", unit: "KG" },
  ],
};

describe("Tally XML", () => {
  it("builds a Stock Journal import with inward and outward lists", () => {
    const xml = buildVoucherImportXml(voucher, "Prudata India");

    expect(xml).toContain("<TALLYREQUEST>Import Data</TALLYREQUEST>");
    expect(xml).toContain("<SVCURRENTCOMPANY>Prudata India</SVCURRENTCOMPANY>");
    expect(xml).toContain('<VOUCHER REMOTEID="margix-TRF-2627-00001" VCHTYPE="Stock Journal" ACTION="Create">');
    expect(xml).toContain("<DATE>20260924</DATE>");
    expect(xml).toContain("<NARRATION>Margix TRF-2627-00001 &lt;A&amp;B&gt;</NARRATION>");
    expect(xml).toMatch(
      /<INVENTORYENTRIESOUT\.LIST><STOCKITEMNAME>Resin &amp; Co<\/STOCKITEMNAME><ISDEEMEDPOSITIVE>No<\/ISDEEMEDPOSITIVE><ACTUALQTY> 30 KG<\/ACTUALQTY>/,
    );
    expect(xml).toContain("<GODOWNNAME>Main Location</GODOWNNAME>");
    expect(xml).toMatch(/<INVENTORYENTRIESIN\.LIST>.*<ISDEEMEDPOSITIVE>Yes<\/ISDEEMEDPOSITIVE>.*<GODOWNNAME>RM Store/);
  });

  it("escapes every XML special character", () => {
    expect(escapeXml(`<a href="x">'&'</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;&apos;&amp;&apos;&lt;/a&gt;");
  });

  it.each([
    ["<RESPONSE><CREATED>1</CREATED><ALTERED>0</ALTERED><ERRORS>0</ERRORS><LASTVCHID>812</LASTVCHID></RESPONSE>", { ok: true, voucherId: "812" }],
    [
      "<RESPONSE><CREATED>0</CREATED><ERRORS>1</ERRORS><LINEERROR>Stock Item &apos;X&apos; does not exist!</LINEERROR></RESPONSE>",
      { ok: false, error: "Tally rejected the voucher: Stock Item 'X' does not exist!" },
    ],
    ["<RESPONSE><CREATED>0</CREATED><ERRORS>1</ERRORS></RESPONSE>", { ok: false, error: "Tally rejected the voucher without details." }],
    ["<RESPONSE><CREATED>0</CREATED><ERRORS>0</ERRORS></RESPONSE>", { ok: false, error: "Tally did not create the voucher." }],
  ])("parses %s", (xml, expected) => {
    expect(parseImportResponse(xml)).toEqual(expected);
  });
});

describe("XmlTallyClient", () => {
  const options = { url: "http://tally.local:9000", company: "Prudata India", timeoutMs: 50 };

  it("posts the voucher and returns Tally's voucher id", async () => {
    let sent = "";
    const client = new XmlTallyClient(options, (async (_url: string | URL | Request, init?: RequestInit) => {
      sent = String(init?.body);
      return new Response("<RESPONSE><CREATED>1</CREATED><ERRORS>0</ERRORS><LASTVCHID>55</LASTVCHID></RESPONSE>");
    }) as typeof fetch);

    expect(await client.push(voucher)).toEqual({ ok: true, voucherId: "55" });
    expect(sent).toContain("<VOUCHERNUMBER>TRF-2627-00001</VOUCHERNUMBER>");
  });

  it("reports HTTP errors, unreachable servers and timeouts in plain language", async () => {
    const httpError = new XmlTallyClient(options, (async () => new Response("", { status: 500 })) as typeof fetch);
    expect(await httpError.push(voucher)).toEqual({ ok: false, error: "Tally Prime returned HTTP 500." });

    const down = new XmlTallyClient(options, (async () => {
      throw new TypeError("fetch failed");
    }) as typeof fetch);
    expect(await down.push(voucher)).toEqual({ ok: false, error: "Tally Prime is not reachable at http://tally.local:9000." });

    const slow = new XmlTallyClient(options, ((_url: string | URL | Request, init?: RequestInit) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal!.reason));
      })) as typeof fetch);
    expect(await slow.push(voucher)).toEqual({ ok: false, error: "Tally Prime did not respond within 0 seconds." });
  });
});
