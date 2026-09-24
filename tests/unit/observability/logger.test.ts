import { afterEach, describe, expect, it, vi } from "vitest";
import { logger } from "@/server/observability/logger";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

function capture(stream: "stdout" | "stderr") {
  const lines: string[] = [];
  vi.spyOn(process[stream], "write").mockImplementation((chunk: string | Uint8Array) => {
    lines.push(String(chunk));
    return true;
  });
  return lines;
}

describe("logger", () => {
  it("writes one JSON object per line with level, message and fields", () => {
    vi.stubEnv("LOG_LEVEL", "info");
    const out = capture("stdout");

    logger.info("api request", { requestId: "r-1", status: 200 });

    expect(out).toHaveLength(1);
    expect(out[0].endsWith("\n")).toBe(true);
    expect(JSON.parse(out[0])).toMatchObject({ level: "info", msg: "api request", requestId: "r-1", status: 200 });
    expect(new Date(JSON.parse(out[0]).time).toString()).not.toBe("Invalid Date");
  });

  it("sends warnings and errors to stderr and serialises errors", () => {
    vi.stubEnv("LOG_LEVEL", "info");
    const err = capture("stderr");

    logger.error("boom", { err: new TypeError("bad input") });

    const entry = JSON.parse(err[0]);
    expect(entry).toMatchObject({ level: "error", msg: "boom", err: { name: "TypeError", message: "bad input" } });
    expect(entry.err.stack).toContain("TypeError");
  });

  it("drops messages below LOG_LEVEL", () => {
    vi.stubEnv("LOG_LEVEL", "warn");
    const out = capture("stdout");
    const err = capture("stderr");

    logger.info("quiet");
    logger.debug("quieter");
    logger.warn("loud");

    expect(out).toHaveLength(0);
    expect(err).toHaveLength(1);
  });
});
