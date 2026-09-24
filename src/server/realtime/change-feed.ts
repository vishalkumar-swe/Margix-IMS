import { Client } from "pg";
import { getEnv } from "@/server/config/env";
import { logger } from "@/server/observability/logger";

/**
 * Live change feed. The database announces every committed business change on
 * the `margix_changes` channel (see migration live_change_notifications); this
 * module holds ONE listening connection per process and fans each notification
 * out to the subscribers (open browser streams).
 *
 * Payloads carry only what changed (entity + action), never data: clients
 * react by re-reading through their normal, permission-checked requests.
 */

export const CHANGE_CHANNEL = "margix_changes";

export type FeedMessage =
  | { type: "change"; entity: string; action: string }
  /** The listener reconnected; changes may have been missed, so re-read everything. */
  | { type: "resync" };

type Subscriber = (message: FeedMessage) => void;

const RECONNECT_MIN_MS = 1_000;
const RECONNECT_MAX_MS = 30_000;

class ChangeFeed {
  private readonly subscribers = new Set<Subscriber>();
  private client: Client | null = null;
  private connecting: Promise<void> | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private reconnectDelay = RECONNECT_MIN_MS;
  private hadConnectionLoss = false;

  subscribe(subscriber: Subscriber): () => void {
    this.subscribers.add(subscriber);
    void this.ensureConnected();
    return () => {
      this.subscribers.delete(subscriber);
      if (this.subscribers.size === 0) this.disconnect();
    };
  }

  /** Resolves once the listener is connected (used by tests and warm-up). */
  ready(): Promise<void> {
    return this.ensureConnected();
  }

  get subscriberCount(): number {
    return this.subscribers.size;
  }

  private ensureConnected(): Promise<void> {
    if (this.client) return Promise.resolve();
    this.connecting ??= this.connect().finally(() => {
      this.connecting = null;
    });
    return this.connecting;
  }

  private async connect(): Promise<void> {
    const client = new Client({ connectionString: listenerConnectionString() });
    client.on("notification", (msg) => this.onNotification(msg.payload));
    client.on("error", (err) => this.onConnectionLost(client, err));
    client.on("end", () => this.onConnectionLost(client));
    try {
      await client.connect();
      await client.query(`LISTEN ${CHANGE_CHANNEL}`);
    } catch (err) {
      client.removeAllListeners();
      await client.end().catch(() => {});
      logger.warn("change feed: connect failed", { err });
      this.scheduleReconnect();
      return;
    }

    if (this.subscribers.size === 0) {
      // Everyone left while we were connecting.
      client.removeAllListeners();
      await client.end().catch(() => {});
      return;
    }
    this.client = client;
    this.reconnectDelay = RECONNECT_MIN_MS;
    if (this.hadConnectionLoss) {
      this.hadConnectionLoss = false;
      this.broadcast({ type: "resync" });
    }
  }

  private onNotification(payload: string | undefined): void {
    if (!payload) return;
    try {
      const { entity, action } = JSON.parse(payload) as { entity?: unknown; action?: unknown };
      if (typeof entity !== "string" || typeof action !== "string") return;
      this.broadcast({ type: "change", entity, action });
    } catch {
      logger.warn("change feed: unreadable notification", { payload });
    }
  }

  private broadcast(message: FeedMessage): void {
    for (const subscriber of this.subscribers) {
      try {
        subscriber(message);
      } catch (err) {
        logger.warn("change feed: subscriber failed", { err });
      }
    }
  }

  private onConnectionLost(client: Client, err?: unknown): void {
    if (this.client !== client) return;
    this.client = null;
    client.removeAllListeners();
    client.end().catch(() => {});
    if (this.subscribers.size === 0) return;
    logger.warn("change feed: connection lost, reconnecting", { err });
    this.hadConnectionLoss = true;
    this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer || this.subscribers.size === 0) return;
    this.hadConnectionLoss = true;
    const delay = this.reconnectDelay;
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, RECONNECT_MAX_MS);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.ensureConnected();
    }, delay);
    this.reconnectTimer.unref();
  }

  private disconnect(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    const client = this.client;
    this.client = null;
    this.hadConnectionLoss = false;
    if (client) {
      client.removeAllListeners();
      client.end().catch(() => {});
    }
  }
}

/** The app's DATABASE_URL without Prisma-only query parameters (schema, connection_limit…). */
function listenerConnectionString(): string {
  const url = new URL(getEnv().DATABASE_URL);
  url.search = "";
  return url.toString();
}

const globalForFeed = globalThis as unknown as { changeFeed?: ChangeFeed };

/** Process-wide feed (survives dev hot reloads, like the Prisma client). */
export const changeFeed = (globalForFeed.changeFeed ??= new ChangeFeed());
