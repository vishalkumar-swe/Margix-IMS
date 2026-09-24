/** Shared E2E settings (imported by playwright.config.ts and the tests). */
export const E2E_DATABASE_URL =
  process.env.E2E_DATABASE_URL ?? "postgresql://margix:margix@127.0.0.1:15432/margix_e2e?schema=public";

/** Password of the seeded demo users (prisma/seed.ts). */
export const DEMO_PASSWORD = "Margix@2026";
