import type { NotificationAlertType, NotificationChannel } from "@prisma/client";
import type { WhatsappContent } from "../notification-messages";

/** What a channel is asked to deliver: one message to one recipient. */
export interface OutgoingNotification {
  /** User id (IN_APP), e-mail address (EMAIL) or phone digits with country code (WHATSAPP). */
  recipient: string;
  alertType: NotificationAlertType | null;
  subject: string;
  text: string;
  /** App path, e.g. /alerts. */
  link: string | null;
  whatsapp: WhatsappContent | null;
}

/**
 * Outcome of one delivery attempt. Providers never throw: a channel without
 * credentials reports SKIPPED ("log-only mode"), and a failure says whether a
 * later retry could succeed.
 */
export type DeliveryResult =
  | { status: "SENT"; providerMessageId?: string | null }
  | { status: "SKIPPED"; reason: string }
  | { status: "FAILED"; error: string; retryable: boolean };

export interface ChannelStatus {
  channel: NotificationChannel;
  configured: boolean;
  /** Plain-language description of the configuration (never secrets). */
  detail: string;
}

/** A delivery channel (in-app, e-mail, WhatsApp). New channels implement this. */
export interface NotificationChannelProvider {
  readonly channel: NotificationChannel;
  status(): ChannelStatus;
  send(notification: OutgoingNotification): Promise<DeliveryResult>;
}

export const NOT_CONFIGURED = "skipped: not configured";

/** Error text safe to store and show (no stack, bounded length). */
export function describeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.length > 500 ? `${message.slice(0, 499)}…` : message;
}
