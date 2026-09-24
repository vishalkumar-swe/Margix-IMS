import { execSync } from "node:child_process";
import { DEMO_PASSWORD, E2E_DATABASE_URL } from "./support/env";

/** Rebuilds the E2E database from migrations and seeds the demo data and users. */
export default function globalSetup(): void {
  if (!/\/[a-z0-9_]+_e2e(\?|$)/.test(E2E_DATABASE_URL)) {
    throw new Error(`Refusing to reset "${E2E_DATABASE_URL}": the E2E database name must end in _e2e.`);
  }
  execSync("npx prisma migrate reset --force --skip-generate", {
    stdio: "pipe",
    env: {
      ...process.env,
      NODE_ENV: "development",
      DATABASE_URL: E2E_DATABASE_URL,
      DIRECT_DATABASE_URL: E2E_DATABASE_URL,
      SEED_ADMIN_EMAIL: "admin@margix.local",
      SEED_ADMIN_PASSWORD: DEMO_PASSWORD,
      SEED_DEMO_USERS: "true",
    },
  });
}
