/**
 * Machine-readable document identity printed on every document: a Code 128
 * barcode of the document number (bottom) and a QR code (top right) whose
 * payload is
 *
 *   MARGIX|<type>|<number>|<date YYYY-MM-DD>|<party GSTIN or ->|<grand total or ->
 *
 * e.g. MARGIX|INV|INV-2026-000001|2026-09-27|29AABCR5678K1Z2|12345.00
 *
 * <type> is the document's series key (PO, GRN, INV, DSP, TRF, SRN, PRN).
 * Scanning either code (or typing the number) finds the document again.
 */

import type { Permission } from "@/lib/permissions";

export const QR_PAYLOAD_PREFIX = "MARGIX";

export const SCANNABLE_DOCUMENTS = {
  PO: { label: "Purchase order", path: "/purchase-orders", permission: "po.view" },
  GRN: { label: "Goods receipt", path: "/grns", permission: "grn.view" },
  INV: { label: "Invoice", path: "/invoices", permission: "invoice.view" },
  DSP: { label: "Dispatch", path: "/dispatches", permission: "dispatch.view" },
  TRF: { label: "Transfer", path: "/transfers", permission: "transfer.view" },
  SRN: { label: "Customer return", path: "/sales-returns", permission: "return.view" },
  PRN: { label: "Supplier return", path: "/purchase-returns", permission: "return.view" },
} as const satisfies Record<string, { label: string; path: string; permission: Permission }>;

export type ScannableDocumentType = keyof typeof SCANNABLE_DOCUMENTS;

export const SCANNABLE_DOCUMENT_TYPES = Object.keys(SCANNABLE_DOCUMENTS) as ScannableDocumentType[];

export function isScannableDocumentType(value: string): value is ScannableDocumentType {
  return (SCANNABLE_DOCUMENT_TYPES as string[]).includes(value);
}

export function scannableDocumentPath(type: ScannableDocumentType, id: string): string {
  return `${SCANNABLE_DOCUMENTS[type].path}/${id}`;
}

export interface DocumentQrFields {
  type: ScannableDocumentType;
  number: string;
  /** YYYY-MM-DD. */
  date: string;
  gstin?: string | null;
  /** Grand total as a decimal string, when the document is priced. */
  total?: string | null;
}

export function buildDocumentQrPayload(fields: DocumentQrFields): string {
  return [QR_PAYLOAD_PREFIX, fields.type, fields.number, fields.date, fields.gstin || "-", fields.total || "-"].join("|");
}

export interface ScannedDocument {
  /** Known when the value was a QR payload; otherwise any document type may match. */
  type: ScannableDocumentType | null;
  number: string;
}

/**
 * Reads a scanned or typed value as a document reference: a QR payload gives
 * type and number; anything else is taken as a document number. Returns null
 * for an empty value or a QR payload that is not ours.
 */
export function parseScannedDocument(value: string): ScannedDocument | null {
  const text = value.trim();
  if (!text) return null;
  if (text.toUpperCase().startsWith(`${QR_PAYLOAD_PREFIX}|`)) {
    const [, type = "", number = ""] = text.split("|");
    const upperType = type.trim().toUpperCase();
    if (!isScannableDocumentType(upperType) || !number.trim()) return null;
    return { type: upperType, number: number.trim().toUpperCase() };
  }
  return { type: null, number: text.toUpperCase() };
}
