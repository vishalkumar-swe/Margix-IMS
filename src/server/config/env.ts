import { z } from "zod";

/** Unset and empty variables are treated alike ("FOO=" in a .env file means "not set"). */
function blankAsUndefined(env: NodeJS.ProcessEnv): Record<string, string | undefined> {
  return Object.fromEntries(Object.entries(env).map(([key, value]) => [key, value === "" ? undefined : value]));
}

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    /** Letterhead of printed documents (invoices, purchase orders, GRN and dispatch notes). */
    COMPANY_NAME: z.string().trim().min(1).default("Margix India"),
    COMPANY_ADDRESS: z.string().trim().min(1).optional(),
    COMPANY_GSTIN: z.string().trim().min(1).optional(),
    /** GST state code of the company (e.g. "29"); only needed when COMPANY_GSTIN is blank. */
    COMPANY_STATE_CODE: z
      .string()
      .trim()
      .regex(/^[0-9]{2}$/, "must be a 2-digit GST state code")
      .optional(),
    /** Bank / payment details printed on tax invoices (free text). */
    COMPANY_BANK_DETAILS: z.string().trim().min(1).optional(),
    DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
    SESSION_TTL_HOURS: z.coerce.number().int().positive().max(24 * 30).default(12),
    /** Consecutive wrong passwords before an account is locked. */
    LOGIN_MAX_ATTEMPTS: z.coerce.number().int().min(3).max(100).default(5),
    /** How long a locked account stays locked. */
    LOGIN_LOCKOUT_MINUTES: z.coerce.number().int().positive().max(24 * 60).default(15),
    TALLY_MODE: z.enum(["mock", "fail", "xml", "disabled"]).default("mock"),
    /** Tally Prime HTTP/XML server (TALLY_MODE=xml). */
    TALLY_URL: z.url().default("http://localhost:9000"),
    /** Company name exactly as loaded in Tally (required for TALLY_MODE=xml). */
    TALLY_COMPANY: z.string().trim().min(1).optional(),
    TALLY_TIMEOUT_MS: z.coerce.number().int().positive().default(15_000),
    /**
     * Default for "slow" stock: no movement for this many days (spec §6.7).
     * Administrators can override it (Administration → Notifications).
     */
    SLOW_STOCK_DAYS: z.coerce.number().int().positive().default(30),
    /** Default for "dead" stock: no movement for this many days (spec §6.7). */
    DEAD_STOCK_DAYS: z.coerce.number().int().positive().default(90),
    /** Public address of the app, used for links in e-mails (e.g. https://margix.example.com). */
    APP_URL: z.url().optional(),
    /** E-mail notifications over SMTP. Without SMTP_HOST and SMTP_FROM e-mail runs log-only. */
    SMTP_HOST: z.string().trim().min(1).optional(),
    SMTP_PORT: z.coerce.number().int().positive().max(65_535).default(587),
    /** true = implicit TLS (port 465); false = STARTTLS when the server offers it (port 587). */
    SMTP_SECURE: z.enum(["true", "false"]).default("false").transform((value) => value === "true"),
    SMTP_USER: z.string().trim().min(1).optional(),
    SMTP_PASSWORD: z.string().min(1).optional(),
    /** Sender, e.g. "Margix IMS <alerts@example.com>". */
    SMTP_FROM: z.string().trim().min(1).optional(),
    /** WhatsApp Cloud API (Meta). Without the token and phone number id WhatsApp runs log-only. */
    WHATSAPP_ACCESS_TOKEN: z.string().trim().min(1).optional(),
    WHATSAPP_PHONE_NUMBER_ID: z.string().trim().min(1).optional(),
    /** Approved template for one low-stock alert; body parameters: product, current stock, minimum. */
    WHATSAPP_TEMPLATE_LOW_STOCK: z.string().trim().min(1).optional(),
    /** Approved template for summaries (digests, slow-moving, tests); one body parameter: the text. */
    WHATSAPP_TEMPLATE_SUMMARY: z.string().trim().min(1).optional(),
    WHATSAPP_TEMPLATE_LANGUAGE: z.string().trim().min(2).default("en"),
    /** Delivery timeout for e-mail and WhatsApp calls. */
    NOTIFY_TIMEOUT_MS: z.coerce.number().int().positive().default(15_000),
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
