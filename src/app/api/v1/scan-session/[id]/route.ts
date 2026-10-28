import { z } from "zod";
import { apiRoute, publicApiRoute } from "@/server/http/api-route";
import { NotFoundError } from "@/server/errors";
import {
  markSessionConnected,
  popBarcodesFromSession,
  pushBarcodeToSession,
} from "@/server/modules/scan/remote-scan-session";

const phoneActionSchema = z.object({
  action: z.enum(["join", "scan"]),
  barcode: z.string().trim().min(1).max(200).optional(),
});

/** Desktop polls this endpoint to drain newly scanned barcodes */
export const GET = apiRoute({ permission: "stock.view" }, async ({ params }) => {
  const result = popBarcodesFromSession(params.id);
  if (!result) {
    throw new NotFoundError("Scan session not found or expired.");
  }
  return result;
});

/** Mobile phone posts join status and scanned barcodes */
export const POST = publicApiRoute({ body: phoneActionSchema }, async ({ params, body }) => {
  const sessionId = params.id;
  if (body.action === "join") {
    const ok = markSessionConnected(sessionId);
    if (!ok) throw new NotFoundError("Scan session not found or expired.");
    return { ok: true, status: "connected" };
  }

  if (body.action === "scan" && body.barcode) {
    const ok = pushBarcodeToSession(sessionId, body.barcode);
    if (!ok) throw new NotFoundError("Scan session not found or expired.");
    return { ok: true, received: body.barcode };
  }

  return { ok: false };
});

