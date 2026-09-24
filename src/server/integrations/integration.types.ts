/**
 * The contract every external integration implements (Tally, e-mail,
 * WhatsApp, webhooks, …). It exists so that every integration is set up,
 * observed and tested the same way — see docs/integrations.md.
 */

export type IntegrationCategory = "accounting" | "messaging" | "events";

/**
 * - `active`: configured and sending for real.
 * - `log-only`: not configured; work is recorded as "skipped" so nothing is lost or blocked.
 * - `simulated`: a mock/test mode is selected (e.g. TALLY_MODE=mock).
 * - `disabled`: switched off on purpose.
 * - `misconfigured`: partly configured — something required is missing.
 */
export type IntegrationState = "active" | "log-only" | "simulated" | "disabled" | "misconfigured";

/** One setting an integration reads (environment variable). Values are never exposed, only whether they are set. */
export interface IntegrationSetting {
  env: string;
  description: string;
  required: boolean;
  /** Secrets are only ever reported as "set" / "not set". */
  secret: boolean;
}

export interface IntegrationStatus {
  state: IntegrationState;
  /** One plain sentence for the admin screen, e.g. "Sends through smtp.gmail.com:587 as alerts@…". */
  summary: string;
}

/** Result of a live connection check. Checks never have side effects (nothing is sent or posted). */
export interface IntegrationCheck {
  ok: boolean;
  message: string;
  latencyMs?: number;
}

/** Work waiting in / failed in the integration's outbox. */
export interface IntegrationQueueStats {
  pending: number;
  failed: number;
  /** Most recent successful delivery. */
  lastSuccessAt: Date | null;
  lastError: string | null;
}

export interface Integration {
  /** Stable id used in URLs and logs, e.g. "tally", "whatsapp". */
  readonly key: string;
  readonly name: string;
  readonly category: IntegrationCategory;
  readonly description: string;
  readonly settings: readonly IntegrationSetting[];
  /** Section in docs/integrations.md with the setup steps. */
  readonly docsAnchor: string;
  status(): IntegrationStatus;
  /** Live connectivity check, when the integration has something to connect to. */
  check?(): Promise<IntegrationCheck>;
  /** Outbox figures, when the integration delivers asynchronously. */
  queueStats?(): Promise<IntegrationQueueStats>;
}
