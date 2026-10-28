import { z } from "zod";
import { apiRoute } from "@/server/http/api-route";
import { getOrCreateScanSession } from "@/server/modules/scan/remote-scan-session";

function resolvePublicOrigin(request: Request): string {
  // 1. Explicit environment variable if configured
  const envUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL;
  if (envUrl) {
    const trimmed = envUrl.trim().replace(/\/$/, "");
    if (trimmed && !trimmed.includes("0.0.0.0") && !trimmed.includes("127.0.0.1")) {
      return trimmed;
    }
  }

  // 2. Reverse proxy / ingress headers
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const hostHeader = request.headers.get("host")?.split(",")[0]?.trim();
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const rawHost = forwardedHost || hostHeader;

  if (rawHost && !rawHost.startsWith("0.0.0.0") && !rawHost.startsWith("127.0.0.1")) {
    const proto = forwardedProto || (request.url.startsWith("https") ? "https" : "http");
    return `${proto}://${rawHost}`;
  }

  // 3. Fallback to production public domain
  return "https://ims.margixindia.com";
}

const sessionRequestSchema = z
  .object({
    sessionId: z.string().trim().optional(),
    forceNew: z.boolean().optional(),
  })
  .optional();

export const POST = apiRoute({ permission: "stock.view", body: sessionRequestSchema }, async ({ request, user, body }) => {
  const session = getOrCreateScanSession({
    sessionId: body?.sessionId,
    userId: user.id,
    forceNew: body?.forceNew ?? false,
  });

  const origin = resolvePublicOrigin(request);
  const qrUrl = `${origin}/scan-remote?session=${session.id}`;

  return {
    sessionId: session.id,
    status: session.status,
    qrUrl,
  };
});

export const GET = apiRoute({ permission: "stock.view" }, async ({ request, user }) => {
  const session = getOrCreateScanSession({
    userId: user.id,
    forceNew: false,
  });

  const origin = resolvePublicOrigin(request);
  const qrUrl = `${origin}/scan-remote?session=${session.id}`;

  return {
    sessionId: session.id,
    status: session.status,
    qrUrl,
  };
});
