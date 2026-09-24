import type { NotificationChannel } from "@prisma/client";
import { getEnv, type Env } from "@/server/config/env";
import type { ChannelStatus, NotificationChannelProvider } from "./channel.types";
import { EmailChannel } from "./email.channel";
import { InAppChannel } from "./in-app.channel";
import { WhatsappChannel } from "./whatsapp.channel";

export type ChannelProviders = Record<NotificationChannel, NotificationChannelProvider>;

/** The delivery channels, configured from the environment. */
export function createChannelProviders(env: Env = getEnv()): ChannelProviders {
  return {
    IN_APP: new InAppChannel(),
    EMAIL: new EmailChannel({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      user: env.SMTP_USER,
      password: env.SMTP_PASSWORD,
      from: env.SMTP_FROM,
      appUrl: env.APP_URL,
      timeoutMs: env.NOTIFY_TIMEOUT_MS,
    }),
    WHATSAPP: new WhatsappChannel({
      accessToken: env.WHATSAPP_ACCESS_TOKEN,
      phoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID,
      templates: { LOW_STOCK: env.WHATSAPP_TEMPLATE_LOW_STOCK, SUMMARY: env.WHATSAPP_TEMPLATE_SUMMARY },
      language: env.WHATSAPP_TEMPLATE_LANGUAGE,
      timeoutMs: env.NOTIFY_TIMEOUT_MS,
    }),
  };
}

/** Configured / not configured, per channel, for the settings screen. */
export function getChannelStatuses(providers: ChannelProviders = createChannelProviders()): ChannelStatus[] {
  return [providers.IN_APP.status(), providers.EMAIL.status(), providers.WHATSAPP.status()];
}
