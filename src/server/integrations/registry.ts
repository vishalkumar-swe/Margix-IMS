import { getEnv } from "@/server/config/env";
import { NotFoundError } from "@/server/errors";
import { logger } from "@/server/observability/logger";
import type { Integration, IntegrationCheck, IntegrationQueueStats, IntegrationStatus } from "./integration.types";
import { emailIntegration, inAppIntegration, whatsappIntegration } from "./messaging/messaging.integrations";
import { tallyIntegration } from "./tally/tally.integration";
import { webhooksIntegration } from "./webhooks/webhooks.integration";

/**
 * Every integration the app has. To add one, implement `Integration` in its
 * own folder and list it here — the Integrations screen, the API and the
 * connection check pick it up automatically (docs/integrations.md).
 */
export function listIntegrations(): Integration[] {
  const env = getEnv();
  return [tallyIntegration(env), emailIntegration(env), whatsappIntegration(env), inAppIntegration(), webhooksIntegration(env)];
}

export function getIntegration(key: string): Integration {
  const integration = listIntegrations().find((i) => i.key === key);
  if (!integration) throw new NotFoundError("Integration", key);
  return integration;
}

/** What the Integrations screen shows: never setting values, only whether each is set. */
export interface IntegrationOverview {
  key: string;
  name: string;
  category: Integration["category"];
  description: string;
  docsAnchor: string;
  status: IntegrationStatus;
  settings: { env: string; description: string; required: boolean; isSet: boolean }[];
  canCheck: boolean;
  queue: IntegrationQueueStats | null;
}

export async function describeIntegrations(): Promise<IntegrationOverview[]> {
  return Promise.all(
    listIntegrations().map(async (integration) => ({
      key: integration.key,
      name: integration.name,
      category: integration.category,
      description: integration.description,
      docsAnchor: integration.docsAnchor,
      status: integration.status(),
      settings: integration.settings.map((s) => ({
        env: s.env,
        description: s.description,
        required: s.required,
        isSet: Boolean(process.env[s.env]?.trim()),
      })),
      canCheck: Boolean(integration.check),
      queue: integration.queueStats ? await integration.queueStats() : null,
    })),
  );
}

/** Runs one integration's live connection check (no side effects). */
export async function checkIntegration(key: string): Promise<IntegrationCheck> {
  const integration = getIntegration(key);
  if (!integration.check) return { ok: true, message: "Nothing to connect to — this integration has no external service." };
  const startedAt = Date.now();
  try {
    const result = await integration.check();
    return { ...result, latencyMs: result.latencyMs ?? Date.now() - startedAt };
  } catch (error) {
    logger.warn("integration check failed", { key, error: error instanceof Error ? error.message : String(error) });
    return { ok: false, message: error instanceof Error ? error.message : "The check failed.", latencyMs: Date.now() - startedAt };
  }
}
