import { z } from "zod";

/** Unset and empty variables are treated alike ("FOO=" in a .env file means "not set"). */
function blankAsUndefined(env: NodeJS.ProcessEnv): Record<string, string | undefined> {
  return Object.fromEntries(Object.entries(env).map(([key, value]) => [key, value === "" ? undefined : value]));
}

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
    SESSION_TTL_HOURS: z.coerce.number().int().positive().max(24 * 30).default(12),
    TALLY_MODE: z.enum(["mock", "fail", "xml", "disabled"]).default("mock"),
    /** Tally Prime HTTP/XML server (TALLY_MODE=xml). */
    TALLY_URL: z.url().default("http://localhost:9000"),
    /** Company name exactly as loaded in Tally (required for TALLY_MODE=xml). */
    TALLY_COMPANY: z.string().trim().min(1).optional(),
    TALLY_TIMEOUT_MS: z.coerce.number().int().positive().default(15_000),
    /** Stock with no movement for this many days is "slow" (spec §6.7). */
    SLOW_STOCK_DAYS: z.coerce.number().int().positive().default(30),
    /** Stock with no movement for this many days is "dead" (spec §6.7). */
    DEAD_STOCK_DAYS: z.coerce.number().int().positive().default(90),
  })
  .superRefine((env, ctx) => {
    if (env.TALLY_MODE === "xml" && !env.TALLY_COMPANY) {
      ctx.addIssue({ code: "custom", path: ["TALLY_COMPANY"], message: "required when TALLY_MODE=xml" });
    }
    if (env.DEAD_STOCK_DAYS < env.SLOW_STOCK_DAYS) {
      ctx.addIssue({ code: "custom", path: ["DEAD_STOCK_DAYS"], message: "must be at least SLOW_STOCK_DAYS" });
    }
  });

export type Env = z.infer<typeof envSchema>;

let cached: Env | undefined;

/**
 * Validated server environment. Parsed lazily so that importing a module never
 * fails at build time; the first real use throws a descriptive error instead.
 */
export function getEnv(): Env {
  if (!cached) {
    const result = envSchema.safeParse(blankAsUndefined(process.env));
    if (!result.success) {
      const issues = result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
      throw new Error(`Invalid environment configuration: ${issues}`);
    }
    cached = result.data;
  }
  return cached;
}
