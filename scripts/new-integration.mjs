#!/usr/bin/env node
/**
 * Scaffolds a new integration adapter:
 *   npm run integration:new -- <key> "<Display name>" [accounting|messaging|events]
 * Creates src/server/integrations/<key>/<key>.integration.ts and prints the
 * remaining steps (docs/integrations.md#adding-a-new-integration).
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const [key, name, category = "events"] = process.argv.slice(2);
if (!key || !/^[a-z][a-z0-9-]{1,30}$/.test(key) || !name) {
  console.error('Usage: npm run integration:new -- <key> "<Display name>" [accounting|messaging|events]');
  console.error('  e.g. npm run integration:new -- shiprocket "Shiprocket" events');
  process.exit(1);
}
if (!["accounting", "messaging", "events"].includes(category)) {
  console.error(`Unknown category "${category}" (accounting, messaging or events).`);
  process.exit(1);
}

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dir = join(root, "src/server/integrations", key);
const file = join(dir, `${key}.integration.ts`);
if (existsSync(file)) {
  console.error(`${file} already exists.`);
  process.exit(1);
}

const camel = key.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase());
const envPrefix = key.toUpperCase().replace(/-/g, "_");

mkdirSync(dir, { recursive: true });
writeFileSync(
  file,
  `import { getEnv, type Env } from "@/server/config/env";
import { integrationFetch } from "../http";
import type { Integration } from "../integration.types";

/**
 * ${name}: TODO one paragraph — what is sent, when, and where the code lives.
 * Guide: docs/integrations.md#adding-a-new-integration
 */
export function ${camel}Integration(env: Env = getEnv()): Integration {
  // TODO: add ${envPrefix}_* variables to src/server/config/env.ts and read them from \`env\`.
  const apiKey = (env as Record<string, unknown>).${envPrefix}_API_KEY as string | undefined;
  const baseUrl = ((env as Record<string, unknown>).${envPrefix}_URL as string | undefined) ?? "https://api.example.com";

  return {
    key: "${key}",
    name: "${name}",
    category: "${category}",
    description: "TODO: one sentence for the Integrations screen.",
    docsAnchor: "${key}",
    settings: [
      { env: "${envPrefix}_API_KEY", description: "API key", required: true, secret: true },
      { env: "${envPrefix}_URL", description: "API base URL", required: false, secret: false },
    ],
    status() {
      return apiKey
        ? { state: "active", summary: \`Connected to \${baseUrl}.\` }
        : { state: "log-only", summary: "Set ${envPrefix}_API_KEY to enable." };
    },
    // A side-effect-free call (profile, ping). Remove if there is nothing to connect to.
    async check() {
      if (!apiKey) return { ok: false, message: "${envPrefix}_API_KEY is not set." };
      const startedAt = Date.now();
      await integrationFetch(
        \`\${baseUrl}/TODO-health\`,
        { headers: { authorization: \`Bearer \${apiKey}\` } },
        { service: "${name}", timeoutMs: 10_000 },
      );
      return { ok: true, message: "${name} answered.", latencyMs: Date.now() - startedAt };
    },
    // If it has an outbox table, report its figures here (see webhooks/webhooks.integration.ts).
    // async queueStats() { … },
  };
}
`,
);

console.log(`Created ${file.replace(root + "/", "")}

Next steps (docs/integrations.md#adding-a-new-integration):
  1. Add ${envPrefix}_* variables to src/server/config/env.ts, .env.example and the README.
  2. Write the client with integrationFetch() in src/server/integrations/${key}/.
  3. Finish the TODOs in ${key}.integration.ts.
  4. Register ${camel}Integration(env) in src/server/integrations/registry.ts.
  5. If it sends asynchronously, add an outbox (copy webhooks/webhook-delivery.ts) and call it from scripts/notify.ts.
  6. Tests under tests/unit/integrations and tests/integration/integrations.
  7. Add a "## ${name}" section to docs/integrations.md.`);
