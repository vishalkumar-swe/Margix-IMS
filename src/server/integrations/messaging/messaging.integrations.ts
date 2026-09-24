import type { NotificationChannel } from "@prisma/client";
import { prisma } from "@/server/db/client";
import { getEnv, type Env } from "@/server/config/env";
import { createChannelProviders } from "@/server/modules/notifications/channels";
import type { EmailChannel } from "@/server/modules/notifications/channels/email.channel";
import type { WhatsappChannel } from "@/server/modules/notifications/channels/whatsapp.channel";
import type { Integration, IntegrationQueueStats } from "../integration.types";

/**
 * Messaging channels used by notifications (low-stock, slow-moving, digests).
 * Messages are queued in notification_outbox and delivered by the notify
 * worker; a channel without credentials runs log-only. Implementation:
 * src/server/modules/notifications/channels/.
 */

async function outboxStats(channel: NotificationChannel): Promise<IntegrationQueueStats> {
  const [pending, failed, lastSent, lastFailure] = await Promise.all([
    prisma.notificationOutbox.count({ where: { channel, status: { in: ["PENDING", "IN_PROGRESS"] } } }),
    prisma.notificationOutbox.count({ where: { channel, status: "FAILED" } }),
    prisma.notificationOutbox.findFirst({ where: { channel, status: "SENT" }, orderBy: { sentAt: "desc" }, select: { sentAt: true } }),
    prisma.notificationOutbox.findFirst({
      where: { channel, status: "FAILED" },
      orderBy: { createdAt: "desc" },
      select: { lastError: true },
    }),
  ]);
  return { pending, failed, lastSuccessAt: lastSent?.sentAt ?? null, lastError: lastFailure?.lastError ?? null };
}

export function emailIntegration(env: Env = getEnv()): Integration {
  const channel = createChannelProviders(env).EMAIL as EmailChannel;
  return {
    key: "email",
    name: "E-mail (SMTP)",
    category: "messaging",
    description: "Sends alert e-mails and daily digests through any SMTP server (e.g. Gmail with an app password).",
    docsAnchor: "e-mail-smtp",
    settings: [
      { env: "SMTP_HOST", description: "SMTP server, e.g. smtp.gmail.com", required: true, secret: false },
      { env: "SMTP_PORT", description: "587 (STARTTLS) or 465 (TLS)", required: false, secret: false },
      { env: "SMTP_SECURE", description: "true for port 465", required: false, secret: false },
      { env: "SMTP_USER", description: "Login", required: false, secret: false },
      { env: "SMTP_PASSWORD", description: "Password / app password", required: false, secret: true },
      { env: "SMTP_FROM", description: 'Sender, e.g. "Margix India <alerts@example.com>"', required: true, secret: false },
      { env: "APP_URL", description: "Public app address for links in e-mails", required: false, secret: false },
    ],
    status() {
      const s = channel.status();
      return { state: s.configured ? "active" : "log-only", summary: s.detail };
    },
    check: () => channel.check(),
    queueStats: () => outboxStats("EMAIL"),
  };
}

export function whatsappIntegration(env: Env = getEnv()): Integration {
  const channel = createChannelProviders(env).WHATSAPP as WhatsappChannel;
  return {
    key: "whatsapp",
    name: "WhatsApp (Meta Cloud API)",
    category: "messaging",
    description: "Sends WhatsApp template messages for low-stock alerts and summaries via Meta's WhatsApp Cloud API.",
    docsAnchor: "whatsapp-meta-cloud-api",
    settings: [
      { env: "WHATSAPP_ACCESS_TOKEN", description: "Permanent system-user access token", required: true, secret: true },
      { env: "WHATSAPP_PHONE_NUMBER_ID", description: "Phone number ID from WhatsApp Manager", required: true, secret: false },
      { env: "WHATSAPP_TEMPLATE_LOW_STOCK", description: "Approved template for low-stock alerts", required: false, secret: false },
      { env: "WHATSAPP_TEMPLATE_SUMMARY", description: "Approved template for digests / tests", required: false, secret: false },
      { env: "WHATSAPP_TEMPLATE_LANGUAGE", description: "Template language code, e.g. en", required: false, secret: false },
    ],
    status() {
      const s = channel.status();
      if (!s.configured) return { state: "log-only", summary: s.detail };
      const missingTemplates = !env.WHATSAPP_TEMPLATE_LOW_STOCK || !env.WHATSAPP_TEMPLATE_SUMMARY;
      return missingTemplates
        ? { state: "misconfigured", summary: `${s.detail}. Set both template names to send every message type.` }
        : { state: "active", summary: s.detail };
    },
    check: () => channel.check(),
    queueStats: () => outboxStats("WHATSAPP"),
  };
}

export function inAppIntegration(): Integration {
  return {
    key: "in-app",
    name: "In-app notifications",
    category: "messaging",
    description: "The bell in the header. Always on; delivered by the notify worker like the other channels.",
    docsAnchor: "in-app-notifications",
    settings: [],
    status: () => ({ state: "active", summary: "Built in; no configuration needed." }),
    queueStats: () => outboxStats("IN_APP"),
  };
}
