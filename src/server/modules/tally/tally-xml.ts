import type { TallyPushResult, TallyVoucher, TallyVoucherLine } from "./tally-client";

/**
 * Tally Prime XML import format (HTTP XML server, default port 9000).
 * Pure functions so the wire format can be unit-tested without a Tally server.
 */

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** "2026-09-24" → "20260924" (Tally date format). */
function tallyDate(isoDate: string): string {
  return isoDate.replaceAll("-", "");
}

/** Tally quantities carry the unit, e.g. " 12.5 KG". Always positive; direction is the list type. */
function tallyQuantity(line: TallyVoucherLine): string {
  const absolute = line.quantity.startsWith("-") ? line.quantity.slice(1) : line.quantity;
  return ` ${absolute} ${escapeXml(line.unit)}`;
}

function inventoryEntry(line: TallyVoucherLine): string {
  const inward = !line.quantity.startsWith("-");
  const tag = inward ? "INVENTORYENTRIESIN.LIST" : "INVENTORYENTRIESOUT.LIST";
  const qty = tallyQuantity(line);
  return [
    `<${tag}>`,
    `<STOCKITEMNAME>${escapeXml(line.stockItem)}</STOCKITEMNAME>`,
    `<ISDEEMEDPOSITIVE>${inward ? "Yes" : "No"}</ISDEEMEDPOSITIVE>`,
    `<ACTUALQTY>${qty}</ACTUALQTY>`,
    `<BILLEDQTY>${qty}</BILLEDQTY>`,
    "<BATCHALLOCATIONS.LIST>",
    `<GODOWNNAME>${escapeXml(line.godown)}</GODOWNNAME>`,
    `<BATCHNAME>${escapeXml(line.batch)}</BATCHNAME>`,
    `<ACTUALQTY>${qty}</ACTUALQTY>`,
    `<BILLEDQTY>${qty}</BILLEDQTY>`,
    "</BATCHALLOCATIONS.LIST>",
    `</${tag}>`,
  ].join("");
}

/**
 * Builds the import envelope for one voucher. REMOTEID ties the Tally voucher
 * to the Margix document so a retried push can be recognised in Tally.
 */
export function buildVoucherImportXml(voucher: TallyVoucher, company: string): string {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    "<ENVELOPE>",
    "<HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER>",
    "<BODY><IMPORTDATA>",
    "<REQUESTDESC><REPORTNAME>Vouchers</REPORTNAME>",
    `<STATICVARIABLES><SVCURRENTCOMPANY>${escapeXml(company)}</SVCURRENTCOMPANY></STATICVARIABLES>`,
    "</REQUESTDESC>",
    '<REQUESTDATA><TALLYMESSAGE xmlns:UDF="TallyUDF">',
    `<VOUCHER REMOTEID="margix-${escapeXml(voucher.voucherNumber)}" VCHTYPE="${escapeXml(voucher.voucherType)}" ACTION="Create">`,
    `<DATE>${tallyDate(voucher.date)}</DATE>`,
    `<VOUCHERTYPENAME>${escapeXml(voucher.voucherType)}</VOUCHERTYPENAME>`,
    `<VOUCHERNUMBER>${escapeXml(voucher.voucherNumber)}</VOUCHERNUMBER>`,
    `<NARRATION>${escapeXml(voucher.narration)}</NARRATION>`,
    ...voucher.lines.map(inventoryEntry),
    "</VOUCHER>",
    "</TALLYMESSAGE></REQUESTDATA>",
    "</IMPORTDATA></BODY>",
    "</ENVELOPE>",
  ].join("");
}

function tagValue(xml: string, tag: string): string | null {
  const match = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "i").exec(xml);
  return match ? match[1].trim() : null;
}

function decodeXml(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

/** Interprets Tally's import response (CREATED/ALTERED/ERRORS/LINEERROR counters). */
export function parseImportResponse(xml: string): TallyPushResult {
  const lineError = tagValue(xml, "LINEERROR");
  if (lineError) return { ok: false, error: `Tally rejected the voucher: ${decodeXml(lineError)}` };

  const created = Number(tagValue(xml, "CREATED") ?? 0);
  const altered = Number(tagValue(xml, "ALTERED") ?? 0);
  const errors = Number(tagValue(xml, "ERRORS") ?? 0);
  if (errors === 0 && created + altered > 0) {
    return { ok: true, voucherId: tagValue(xml, "LASTVCHID") ?? "unknown" };
  }
  return {
    ok: false,
    error: errors > 0 ? "Tally rejected the voucher without details." : "Tally did not create the voucher.",
  };
}
