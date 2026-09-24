/**
 * Where each source document type is shown in the app. Shared by ledger
 * reference links, the Tally queue and anywhere else a document is linked.
 */
const DOCUMENT_PATHS: Partial<Record<string, string>> = {
  GRN: "/grns",
  DISPATCH: "/dispatches",
  ADJUSTMENT: "/adjustments",
  TRANSFER: "/transfers",
  SALES_RETURN: "/sales-returns",
  PURCHASE_RETURN: "/purchase-returns",
};

/** Detail page of a document, or null when the type has no page (e.g. opening balances). */
export function documentHref(type: string, id: string): string | null {
  const base = DOCUMENT_PATHS[type];
  return base ? `${base}/${id}` : null;
}
