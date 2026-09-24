import { execSync } from "node:child_process";

/**
 * Rebuilds the test database from migrations once per test run.
 * Refuses to run against anything but a *_test database.
 */
export default function setup(): void {
  const url = process.env.DATABASE_URL ?? "";
  if (!/\/[a-z0-9_]+_test(\?|$)/.test(url)) {
    throw new Error(`Refusing to run tests: DATABASE_URL must point at a *_test database (got "${url}").`);
  }
  execSync("npx prisma migrate reset --force --skip-seed --skip-generate", {
    stdio: "pipe",
    env: process.env,
  });
}
