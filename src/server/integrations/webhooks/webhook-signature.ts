import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Webhook signatures (same scheme as Stripe's): the header
 *   X-Margix-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256(secret, "<t>.<raw body>")>
 * lets receivers prove a request came from Margix and was not replayed.
 * Receivers: recompute v1 over the RAW request body and reject timestamps
 * older than a few minutes. Examples in docs/integrations.md#webhooks.
 */

export const SIGNATURE_HEADER = "x-margix-signature";

export function signWebhookBody(secret: string, body: string, timestamp: number = Math.floor(Date.now() / 1000)): string {
  const digest = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
  return `t=${timestamp},v1=${digest}`;
}

/** Verifies a signature header (used by tests and as a reference implementation for receivers). */
export function verifyWebhookSignature(
  secret: string,
  body: string,
  header: string,
  toleranceSeconds = 300,
  now: number = Math.floor(Date.now() / 1000),
): boolean {
  const parts = Object.fromEntries(header.split(",").map((part) => part.split("=", 2) as [string, string]));
  const timestamp = Number(parts.t);
  if (!Number.isFinite(timestamp) || !parts.v1 || Math.abs(now - timestamp) > toleranceSeconds) return false;
  const expected = Buffer.from(signWebhookBody(secret, body, timestamp).split("v1=")[1], "hex");
  const given = Buffer.from(parts.v1, "hex");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** A new random signing secret, shown to the admin once. */
export function newWebhookSecret(): string {
  return `whsec_${createHmac("sha256", crypto.randomUUID()).update(String(Date.now())).digest("hex").slice(0, 40)}`;
}
