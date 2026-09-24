import { ApiClientError, apiRequest } from "@/lib/api-client";
import { findByScanCode } from "@/lib/barcode";
import type { ScannableDocumentType } from "@/lib/document-codes";
import type { SkuOption } from "@/lib/options";

/** Client-side calls to the scan lookup APIs. A code that matches nothing resolves to null. */

export interface ScannedSku extends SkuOption {
  status: "ACTIVE" | "INACTIVE" | "ARCHIVED";
}

export interface ScannedDocumentRef {
  type: ScannableDocumentType;
  id: string;
  number: string;
  url: string;
}

async function nullWhenNotFound<T>(request: Promise<T>): Promise<T | null> {
  try {
    return await request;
  } catch (error) {
    if (error instanceof ApiClientError && error.code === "NOT_FOUND") return null;
    throw error;
  }
}

export function lookupSku(code: string): Promise<ScannedSku | null> {
  return nullWhenNotFound(apiRequest<ScannedSku>(`/skus/lookup?${new URLSearchParams({ code })}`));
}

export function lookupDocument(code: string): Promise<ScannedDocumentRef | null> {
  return nullWhenNotFound(apiRequest<ScannedDocumentRef>(`/documents/lookup?${new URLSearchParams({ code })}`));
}

/**
 * Resolves a scanned product code among the products a form offers; when it
 * is not one of them, asks the server so the message can say why.
 */
export async function resolveScannedSku<T extends SkuOption>(
  offered: T[],
  code: string,
  notOfferedReason = "cannot be used here",
): Promise<{ sku: T } | { error: string }> {
  const local = findByScanCode(offered, code);
  if (local) return { sku: local };
  try {
    const found = await lookupSku(code);
    if (!found) return { error: `No product has the barcode or code "${code}".` };
    if (found.status !== "ACTIVE") return { error: `${found.code} · ${found.name} is ${found.status.toLowerCase()}.` };
    return { error: `${found.code} · ${found.name} ${notOfferedReason}.` };
  } catch (error) {
    return { error: lookupErrorMessage(error) };
  }
}

/** A readable message for a lookup that failed for another reason (network, permission). */
export function lookupErrorMessage(error: unknown): string {
  return error instanceof ApiClientError ? error.message : "The lookup failed. Check your connection and try again.";
}
