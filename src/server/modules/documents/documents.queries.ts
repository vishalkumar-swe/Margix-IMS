import {
  parseScannedDocument,
  scannableDocumentPath,
  SCANNABLE_DOCUMENT_TYPES,
  type ScannableDocumentType,
} from "@/lib/document-codes";
import { prisma } from "@/server/db/client";

export interface FoundDocument {
  type: ScannableDocumentType;
  id: string;
  number: string;
  /** Detail page in the app. */
  url: string;
}

/** Finds the id of a document of one type by its number (all numbers are unique per type). */
const FIND_BY_NUMBER: Record<ScannableDocumentType, (number: string) => Promise<{ id: string } | null>> = {
  PO: (number) => prisma.purchaseOrder.findUnique({ where: { poNumber: number }, select: { id: true } }),
  GRN: (number) => prisma.grn.findUnique({ where: { grnNumber: number }, select: { id: true } }),
  INV: (number) => prisma.invoice.findUnique({ where: { invoiceNumber: number }, select: { id: true } }),
  DSP: (number) => prisma.outward.findUnique({ where: { outwardNumber: number }, select: { id: true } }),
  TRF: (number) => prisma.transfer.findUnique({ where: { transferNumber: number }, select: { id: true } }),
  SRN: (number) => prisma.salesReturn.findUnique({ where: { returnNumber: number }, select: { id: true } }),
  PRN: (number) => prisma.purchaseReturn.findUnique({ where: { returnNumber: number }, select: { id: true } }),
};

/**
 * The document a scanned barcode / QR code (or a typed number) refers to.
 * A QR payload names the type; a bare number is looked up in every series
 * (numbering patterns are configurable, so the prefix alone is not trusted).
 */
export async function findDocumentByCode(code: string): Promise<FoundDocument | null> {
  const scanned = parseScannedDocument(code);
  if (!scanned) return null;

  const types = scanned.type ? [scanned.type] : SCANNABLE_DOCUMENT_TYPES;
  const matches = await Promise.all(types.map((type) => FIND_BY_NUMBER[type](scanned.number)));
  const index = matches.findIndex(Boolean);
  if (index < 0) return null;

  const type = types[index];
  const id = matches[index]!.id;
  return { type, id, number: scanned.number, url: scannableDocumentPath(type, id) };
}
