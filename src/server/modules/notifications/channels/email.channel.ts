import nodemailer from "nodemailer";
import { logger } from "@/server/observability/logger";
import { describeError, NOT_CONFIGURED, type DeliveryResult, type NotificationChannelProvider, type OutgoingNotification } from "./channel.types";

export interface SmtpConfig {
  host?: string;
  port: number;
  /** Implicit TLS (465); otherwise STARTTLS when offered (587). */
  secure: boolean;
  user?: string;
  password?: string;
  /** Sender, e.g. "Margix IMS <alerts@example.com>". */
  from?: string;
  /** Public app address, so links in e-mails are absolute. */
  appUrl?: string;
  timeoutMs: number;
}

/** The part of a nodemailer transport this channel uses (replaced in tests). */
export interface MailTransport {
  sendMail(mail: { from: string; to: string; subject: string; text: string }): Promise<{ messageId?: string }>;
  /** Connects and authenticates without sending anything. */
  verify?(): Promise<unknown>;
}

export type MailTransportFactory = (config: SmtpConfig) => MailTransport;

const createSmtpTransport: MailTransportFactory = (config) =>
  nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: config.user ? { user: config.user, pass: config.password ?? "" } : undefined,
    connectionTimeout: config.timeoutMs,
    greetingTimeout: config.timeoutMs,
    socketTimeout: config.timeoutMs,
  });

/**
 * E-mail over SMTP (e.g. Gmail with an app password, or any provider's SMTP
 * relay). Without SMTP_HOST and SMTP_FROM it runs log-only: nothing is sent
 * and the delivery is recorded as skipped.
 */
export class EmailChannel implements NotificationChannelProvider {
  readonly channel = "EMAIL" as const;
  private transport: MailTransport | null = null;

  constructor(
    private readonly config: SmtpConfig,
    private readonly transportFactory: MailTransportFactory = createSmtpTransport,
  ) {}

  get configured(): boolean {
    return Boolean(this.config.host && this.config.from);
  }

  status() {
    return {
      channel: this.channel,
      configured: this.configured,
      detail: this.configured
        ? `SMTP ${this.config.host}:${this.config.port}${this.config.secure ? " (TLS)" : ""}, from ${this.config.from}`
        : "Not configured: set SMTP_HOST and SMTP_FROM (and SMTP_USER / SMTP_PASSWORD).",
    };
  }

  async send(notification: OutgoingNotification): Promise<DeliveryResult> {
    if (!this.configured) {
      logger.info("notification not sent (e-mail not configured)", { to: notification.recipient, subject: notification.subject });
      return { status: "SKIPPED", reason: NOT_CONFIGURED };
    }
    try {
      this.transport ??= this.transportFactory(this.config);
      const info = await this.transport.sendMail({
        from: this.config.from!,
        to: notification.recipient,
        subject: notification.subject,
        text: this.withLink(notification),
      });
      return { status: "SENT", providerMessageId: info.messageId ?? null };
    } catch (error) {
      // 5xx SMTP replies are permanent (e.g. 550 unknown mailbox); the rest may pass later.
      const responseCode = (error as { responseCode?: number }).responseCode;
      const permanent = typeof responseCode === "number" && responseCode >= 500 && responseCode !== 535;
      return { status: "FAILED", error: describeError(error), retryable: !permanent };
    }
  }

  /** Connection check: SMTP handshake and login, no message sent. */
  async check(): Promise<{ ok: boolean; message: string }> {
    if (!this.configured) return { ok: false, message: "Not configured." };
    try {
      this.transport ??= this.transportFactory(this.config);
      await this.transport.verify?.();
      return { ok: true, message: `Connected to ${this.config.host}:${this.config.port} and signed in.` };
    } catch (error) {
      return { ok: false, message: describeError(error) };
    }
  }

  private withLink(notification: OutgoingNotification): string {
    if (!notification.link || !this.config.appUrl) return notification.text;
    const url = new URL(notification.link, this.config.appUrl).toString();
    return `${notification.text}\n\nOpen in Margix IMS: ${url}`;
  }
}
