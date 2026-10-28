import { apiRoute } from "@/server/http/api-route";
import { createScanSession } from "@/server/modules/scan/remote-scan-session";

export const POST = apiRoute({ permission: "stock.view" }, async ({ request }) => {
  const session = createScanSession();
  const url = new URL(request.url);
  const origin = url.origin;
  const qrUrl = `${origin}/scan-remote?session=${session.id}`;

  return {
    sessionId: session.id,
    qrUrl,
  };
});

