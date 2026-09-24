import { logger } from "@/server/observability/logger";
import { describeError, NOT_CONFIGURED, type DeliveryResult, type NotificationChannelProvider, type OutgoingNotification } from "./channel.types";

export const WHATSAPP_GRAPH_URL = "https://graph.facebook.com/v21.0";

export interface WhatsappConfig {
  accessToken?: string;
  phoneNumberId?: string;
  /** Approved template names by message kind. */
  templates: { LOW_STOCK?: string; SUMMARY?: string };
  /** Template language code, e.g. "en" or "en_US". */
  language: string;
  timeoutMs: number;
}

type Fetch = typeof fetch;

interface GraphResponse {
  messages?: { id?: string }[];
  error?: { message?: string; code?: number; error_data?: { details?: string } };
}

/**
 * WhatsApp via Meta's WhatsApp Cloud API. Business-initiated messages must use
 * a template approved in WhatsApp Manager, so every message is sent as a
 * template: LOW_STOCK (product, current stock, minimum) or SUMMARY (one text).
 * Without an access token and phone number id the channel runs log-only.
 */
export class WhatsappChannel implements NotificationChannelProvider {
  readonly channel = "WHATSAPP" as const;

  constructor(
    private readonly config: WhatsappConfig,
    private readonly fetchImpl: Fetch = (...args) => fetch(...args),
  ) {}

  get configured(): boolean {
    return Boolean(this.config.accessToken && this.config.phoneNumberId);
  }

  status() {
    const templates = Object.entries(this.config.templates)
      .filter(([, name]) => name)
      .map(([kind, name]) => `${kind.toLowerCase()}: ${name}`);
    return {
      channel: this.channel,
      configured: this.configured,
      detail: this.configured
        ? `Cloud API, phone number id ${this.config.phoneNumberId}; templates ${templates.join(", ") || "none set"} (${this.config.language})`
        : "Not configured: set WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID and the template names.",
    };
  }

  /** Connection check: reads the phone number's profile with the token, sends nothing. */
  async check(): Promise<{ ok: boolean; message: string }> {
    if (!this.configured) return { ok: false, message: "Not configured." };
    try {
      const response = await this.fetchImpl(
        `${WHATSAPP_GRAPH_URL}/${this.config.phoneNumberId}?fields=display_phone_number,verified_name`,
        { headers: { authorization: `Bearer ${this.config.accessToken}` }, signal: AbortSignal.timeout(this.config.timeoutMs) },
      );
      const body = (await response.json().catch(() => ({}))) as {
        display_phone_number?: string;
        verified_name?: string;
        error?: { message?: string };
      };
      if (!response.ok) return { ok: false, message: body.error?.message ?? `WhatsApp Cloud API returned HTTP ${response.status}.` };
      return { ok: true, message: `Connected: ${body.verified_name ?? "business number"} ${body.display_phone_number ?? ""}`.trim() };
    } catch (error) {
      return { ok: false, message: describeError(error) };
    }
  }

  async send(notification: OutgoingNotification): Promise<DeliveryResult> {
    const content = notification.whatsapp;
    const template = content ? this.config.templates[content.template] : undefined;
    if (!this.configured || !content) {
      logger.info("notification not sent (WhatsApp not configured)", { to: notification.recipient, subject: notification.subject });
      return { status: "SKIPPED", reason: NOT_CONFIGURED };
    }
    if (!template) {
      logger.info("notification not sent (WhatsApp template not configured)", { kind: content.template });
      return { status: "SKIPPED", reason: `skipped: WhatsApp template for ${content.template.toLowerCase().replace("_", " ")} not configured` };
    }

    try {
      const response = await this.fetchImpl(`${WHATSAPP_GRAPH_URL}/${this.config.phoneNumberId}/messages`, {
        method: "POST",
        headers: { authorization: `Bearer ${this.config.accessToken}`, "content-type": "application/json" },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: notification.recipient,
          type: "template",
          template: {
            name: template,
            language: { code: this.config.language },
            components: [{ type: "body", parameters: content.params.map((text) => ({ type: "text", text })) }],
          },
        }),
        signal: AbortSignal.timeout(this.config.timeoutMs),
      });
      const body = (await response.json().catch(() => ({}))) as GraphResponse;
      if (response.ok) return { status: "SENT", providerMessageId: body.messages?.[0]?.id ?? null };

      const detail = body.error?.error_data?.details ?? body.error?.message ?? response.statusText;
      return {
        status: "FAILED",
        error: `WhatsApp API ${response.status}: ${detail}`,
        // Bad request / unknown template or number will not fix itself; auth, rate limits and outages may.
        retryable: response.status !== 400 && response.status !== 404,
      };
    } catch (error) {
      return { status: "FAILED", error: describeError(error), retryable: true };
    }
  }
}
