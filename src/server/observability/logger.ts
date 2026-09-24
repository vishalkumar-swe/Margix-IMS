/**
 * Structured logging (spec §12.4): one JSON object per line on stdout/stderr,
 * ready for any log collector. Levels below LOG_LEVEL are dropped.
 */

type Level = "debug" | "info" | "warn" | "error";
type Fields = Record<string, unknown>;

const LEVELS: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

function threshold(): number {
  const configured = process.env.LOG_LEVEL as Level | undefined;
  return LEVELS[configured ?? "info"] ?? LEVELS.info;
}

function serialiseError(error: unknown): Fields {
  if (error instanceof Error) {
    return { name: error.name, message: error.message, stack: error.stack };
  }
  return { message: String(error) };
}

function write(level: Level, message: string, fields: Fields = {}): void {
  if (LEVELS[level] < threshold()) return;

  const { err, ...rest } = fields;
  const line = JSON.stringify({
    time: new Date().toISOString(),
    level,
    msg: message,
    ...rest,
    ...(err !== undefined ? { err: serialiseError(err) } : {}),
  });
  if (level === "error" || level === "warn") process.stderr.write(`${line}\n`);
  else process.stdout.write(`${line}\n`);
}

export const logger = {
  debug: (message: string, fields?: Fields) => write("debug", message, fields),
  info: (message: string, fields?: Fields) => write("info", message, fields),
  warn: (message: string, fields?: Fields) => write("warn", message, fields),
  /** Pass the caught value as `err` to get name, message and stack. */
  error: (message: string, fields?: Fields) => write("error", message, fields),
};
