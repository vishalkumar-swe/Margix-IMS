import { afterEach, describe, expect, it, vi } from "vitest";
import { GET as healthRoute } from "@/app/api/health/route";
import { GET as readyRoute } from "@/app/api/ready/route";
import { GET as meRoute } from "@/app/api/v1/auth/me/route";
import { createUser } from "../../helpers/factories";
import { callRoute, sessionCookieFor } from "../../helpers/http";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("health endpoints", () => {
  it("reports liveness without touching the database", async () => {
    const res = healthRoute();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
  });

  it("reports readiness when the database answers", async () => {
    const res = await readyRoute();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: "ready", database: "ok" });
  });
});

describe("request logging", () => {
  it("logs one access line per API call and keeps an upstream request id", async () => {
    vi.stubEnv("LOG_LEVEL", "info");
    const lines: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk: string | Uint8Array) => {
      lines.push(String(chunk));
      return true;
    });
    const user = await createUser("ACCOUNTS");

    const res = await callRoute(meRoute, {
      cookie: await sessionCookieFor(user.id),
      headers: { "x-request-id": "edge-req-12345" },
    });

    expect(res.headers.get("x-request-id")).toBe("edge-req-12345");
    const entries = lines.map((l) => JSON.parse(l)).filter((e) => e.msg === "api request");
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      level: "info",
      requestId: "edge-req-12345",
      method: "GET",
      path: "/api/v1/test",
      status: 200,
      userId: user.id,
    });
    expect(typeof entries[0].durationMs).toBe("number");
  });

  it("ignores malformed request ids", async () => {
    const res = await callRoute(meRoute, { headers: { "x-request-id": "bad id with spaces" } });
    expect(res.headers.get("x-request-id")).toMatch(/^[0-9a-f-]{36}$/);
  });
});
