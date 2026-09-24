import { describe, expect, it, vi } from "vitest";
import type { OutgoingNotification } from "@/server/modules/notifications/channels/channel.types";
import { EmailChannel, type MailTransport, type SmtpConfig } from "@/server/modules/notifications/channels/email.channel";
import { WHATSAPP_GRAPH_URL, WhatsappChannel, type WhatsappConfig } from "@/server/modules/notifications/channels/whatsapp.channel";

const message: OutgoingNotification = {
  recipient: "buyer@example.com",
  alertType: "LOW_STOCK",
  subject: "Low Stock Alert: PET Resin (RM-001)",
  text: "Low Stock Alert: Product PET Resin (RM-001) …",
  link: "/alerts",
  whatsapp: { template: "LOW_STOCK", params: ["PET Resin (RM-001) at Main Warehouse", "8 KG", "20 KG"] },
};

const smtp: SmtpConfig = {
  host: "smtp.gmail.com",
  port: 587,
  secure: false,
  user: "alerts@example.com",
  password: "app-password",
  from: "Margix IMS <alerts@example.com>",
  appUrl: "https://margix.example.com",
  timeoutMs: 1_000,
};

describe("e-mail channel (SMTP)", () => {
  it("sends through the transport with an absolute link to the app", async () => {
    const sendMail = vi.fn<MailTransport["sendMail"]>().mockResolvedValue({ messageId: "<m1@example.com>" });
    const factory = vi.fn(() => ({ sendMail }));
    const channel = new EmailChannel(smtp, factory);

    const result = await channel.send(message);

    expect(result).toEqual({ status: "SENT", providerMessageId: "<m1@example.com>" });
    expect(factory).toHaveBeenCalledWith(smtp);
    expect(sendMail).toHaveBeenCalledWith({
      from: "Margix IMS <alerts@example.com>",
      to: "buyer@example.com",
      subject: message.subject,
      text: `${message.text}\n\nOpen in Margix IMS: https://margix.example.com/alerts`,
    });
  });

  it("runs log-only without SMTP_HOST / SMTP_FROM and never touches a transport", async () => {
    const factory = vi.fn();
    const channel = new EmailChannel({ ...smtp, host: undefined }, factory);
    expect(await channel.send(message)).toEqual({ status: "SKIPPED", reason: "skipped: not configured" });
    expect(factory).not.toHaveBeenCalled();
    expect(channel.status()).toMatchObject({ channel: "EMAIL", configured: false });
  });

  it("treats 5xx SMTP replies as permanent and other errors as retryable", async () => {
    const permanent = Object.assign(new Error("550 5.1.1 User unknown"), { responseCode: 550 });
    const channel = new EmailChannel(smtp, () => ({ sendMail: vi.fn().mockRejectedValue(permanent) }));
    expect(await channel.send(message)).toEqual({ status: "FAILED", error: "550 5.1.1 User unknown", retryable: false });

    const timeout = Object.assign(new Error("Connection timeout"), { code: "ETIMEDOUT" });
    const flaky = new EmailChannel(smtp, () => ({ sendMail: vi.fn().mockRejectedValue(timeout) }));
    expect(await flaky.send(message)).toMatchObject({ status: "FAILED", retryable: true });

    // 535 = bad credentials: fixable by correcting the password, so retried.
    const auth = Object.assign(new Error("535 Authentication failed"), { responseCode: 535 });
    const badLogin = new EmailChannel(smtp, () => ({ sendMail: vi.fn().mockRejectedValue(auth) }));
    expect(await badLogin.send(message)).toMatchObject({ status: "FAILED", retryable: true });
  });

  it("describes its configuration without secrets", () => {
    const status = new EmailChannel(smtp).status();
    expect(status).toMatchObject({ configured: true });
    expect(status.detail).toContain("smtp.gmail.com:587");
    expect(status.detail).not.toContain("app-password");
  });
});

const whatsapp: WhatsappConfig = {
  accessToken: "EAAG-token",
  phoneNumberId: "1234567890",
  templates: { LOW_STOCK: "low_stock_alert", SUMMARY: "stock_summary" },
  language: "en",
  timeoutMs: 1_000,
};

const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("WhatsApp channel (Meta Cloud API)", () => {
  it("posts an approved template message with the body parameters", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(200, { messages: [{ id: "wamid.ABC" }] }));
    const channel = new WhatsappChannel(whatsapp, fetchMock);

    const result = await channel.send({ ...message, recipient: "919876543210" });

    expect(result).toEqual({ status: "SENT", providerMessageId: "wamid.ABC" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${WHATSAPP_GRAPH_URL}/1234567890/messages`);
    expect(WHATSAPP_GRAPH_URL).toBe("https://graph.facebook.com/v21.0");
    expect(init?.method).toBe("POST");
    expect((init?.headers as Record<string, string>).authorization).toBe("Bearer EAAG-token");
    expect(JSON.parse(String(init?.body))).toEqual({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: "919876543210",
      type: "template",
      template: {
        name: "low_stock_alert",
        language: { code: "en" },
        components: [
          {
            type: "body",
            parameters: [
              { type: "text", text: "PET Resin (RM-001) at Main Warehouse" },
              { type: "text", text: "8 KG" },
              { type: "text", text: "20 KG" },
            ],
          },
        ],
      },
    });
  });

  it("runs log-only without credentials, and skips kinds whose template is not set", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const unconfigured = new WhatsappChannel({ ...whatsapp, accessToken: undefined }, fetchMock);
    expect(await unconfigured.send(message)).toEqual({ status: "SKIPPED", reason: "skipped: not configured" });

    const noSummary = new WhatsappChannel({ ...whatsapp, templates: { LOW_STOCK: "low_stock_alert" } }, fetchMock);
    const result = await noSummary.send({ ...message, whatsapp: { template: "SUMMARY", params: ["x"] } });
    expect(result).toMatchObject({ status: "SKIPPED" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not retry rejected requests but retries rate limits, outages and network errors", async () => {
    const rejected = new WhatsappChannel(
      whatsapp,
      vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(400, { error: { message: "Template name does not exist", code: 132001 } })),
    );
    expect(await rejected.send(message)).toEqual({
      status: "FAILED",
      error: "WhatsApp API 400: Template name does not exist",
      retryable: false,
    });

    const limited = new WhatsappChannel(whatsapp, vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(429, { error: { message: "Rate limit" } })));
    expect(await limited.send(message)).toMatchObject({ status: "FAILED", retryable: true });

    const down = new WhatsappChannel(whatsapp, vi.fn<typeof fetch>().mockRejectedValue(new TypeError("fetch failed")));
    expect(await down.send(message)).toEqual({ status: "FAILED", error: "fetch failed", retryable: true });
  });
});
