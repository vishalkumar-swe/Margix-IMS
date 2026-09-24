import { defineConfig, devices } from "@playwright/test";
import { E2E_DATABASE_URL } from "./e2e/support/env";

/**
 * End-to-end tests against a production build (`npm run build` first) and a
 * dedicated database that global setup rebuilds and seeds on every run.
 * E2E_DATABASE_URL must name a *_e2e database the login may drop/create.
 */
const port = Number(process.env.E2E_PORT ?? 3100);

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  // The scenario is one ordered story over shared data.
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npx next start -p ${port}`,
    url: `http://127.0.0.1:${port}/api/health`,
    reuseExistingServer: false,
    timeout: 60_000,
    env: {
      DATABASE_URL: E2E_DATABASE_URL,
      DIRECT_DATABASE_URL: E2E_DATABASE_URL,
      TALLY_MODE: "mock",
      LOG_LEVEL: "warn",
    },
  },
});
