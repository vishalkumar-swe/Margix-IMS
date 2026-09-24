import type { NotificationChannel } from "@prisma/client";
import type { ChannelProviders } from "@/server/modules/notifications/channels";
import type {
  DeliveryResult,
  NotificationChannelProvider,
  OutgoingNotification,
} from "@/server/modules/notifications/channels/channel.types";
import { InAppChannel } from "@/server/modules/notifications/channels/in-app.channel";

/** A channel that records what it was asked to send and answers with a scripted result. */
export class FakeChannel implements NotificationChannelProvider {
  readonly sent: OutgoingNotification[] = [];

  constructor(
    readonly channel: NotificationChannel,
    private readonly respond: (n: OutgoingNotification) => DeliveryResult | Promise<DeliveryResult> = () => ({ status: "SENT" }),
  ) {}

  status() {
    return { channel: this.channel, configured: true, detail: "fake" };
  }

  async send(notification: OutgoingNotification): Promise<DeliveryResult> {
    this.sent.push(notification);
    return this.respond(notification);
  }
}

/** Real in-app delivery plus fake e-mail and WhatsApp. */
export function fakeProviders(overrides: Partial<ChannelProviders> = {}): ChannelProviders & {
  EMAIL: NotificationChannelProvider;
  WHATSAPP: NotificationChannelProvider;
} {
  return {
    IN_APP: new InAppChannel(),
    EMAIL: new FakeChannel("EMAIL"),
    WHATSAPP: new FakeChannel("WHATSAPP"),
    ...overrides,
  };
}
