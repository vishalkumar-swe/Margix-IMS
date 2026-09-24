import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  SESSION_TTL_HOURS: z.coerce.number().int().positive().max(24 * 30).default(12),
  TALLY_MODE: z.enum(["mock", "fail", "disabled"]).default("mock"),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | undefined;

/**
 * Validated server environment. Parsed lazily so that importing a module never
 * fails at build time; the first real use throws a descriptive error instead.
 */
export function getEnv(): Env {
  if (!cached) {
    const result = envSchema.safeParse(process.env);
    if (!result.success) {
      const issues = result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
      throw new Error(`Invalid environment configuration: ${issues}`);
    }
    cached = result.data;
  }
  return cached;
}
