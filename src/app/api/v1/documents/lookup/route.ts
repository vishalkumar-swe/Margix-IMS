import { SCANNABLE_DOCUMENTS } from "@/lib/document-codes";
import { can } from "@/lib/permissions";
import { scanLookupQuerySchema } from "@/lib/validation/scan";
import { ForbiddenError, NotFoundError } from "@/server/errors";
import { apiRoute } from "@/server/http/api-route";
import { findDocumentByCode } from "@/server/modules/documents/documents.queries";

/**
 * Resolves a scanned document barcode / QR code (or a typed number) to
 * { type, id, number, url } across PO, GRN, INV, DSP, TRF, SRN and PRN.
 */
export const GET = apiRoute({ query: scanLookupQuerySchema }, async ({ query, user }) => {
  const found = await findDocumentByCode(query.code);
  if (!found) throw new NotFoundError("Document", query.code);
  if (!can(user.role, SCANNABLE_DOCUMENTS[found.type].permission)) throw new ForbiddenError();
  return found;
});
