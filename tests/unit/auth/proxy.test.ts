import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { proxy } from "@/proxy";

const request = (path: string, cookie?: string) =>
  new NextRequest(`https://margix.test${path}`, { headers: cookie ? { cookie } : {} });

describe("proxy (optimistic auth gate)", () => {
  it("never redirects /login, even with a (possibly expired) session cookie", () => {
    // Regression: /login → / → /login looped forever for an expired session.
    for (const cookie of [undefined, "margix_session=expired-token"]) {
      const response = proxy(request("/login", cookie));
      expect(response.headers.get("location")).toBeNull();
    }
  });

  it("sends visitors without a session to the login page, keeping where they were going", () => {
    const response = proxy(request("/stock?q=RM"));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://margix.test/login?next=%2Fstock%3Fq%3DRM");
  });

  it("answers API calls without a session with 401 instead of a redirect", async () => {
    const response = proxy(request("/api/v1/stock"));
    expect(response.status).toBe(401);
    expect((await response.json()).error.code).toBe("UNAUTHENTICATED");
  });

  it("lets requests with a session cookie through (pages verify the session)", () => {
    expect(proxy(request("/stock", "margix_session=abc")).headers.get("location")).toBeNull();
  });
});
