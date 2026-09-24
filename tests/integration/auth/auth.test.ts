import { beforeEach, describe, expect, it } from "vitest";
import { POST as loginRoute } from "@/app/api/v1/auth/login/route";
import { POST as logoutRoute } from "@/app/api/v1/auth/logout/route";
import { GET as meRoute } from "@/app/api/v1/auth/me/route";
import { MAX_FAILED_LOGINS } from "@/server/auth/auth.service";
import { hashPassword } from "@/server/auth/password";
import { prisma } from "@/server/db/client";
import { createUser } from "../../helpers/factories";
import { callRoute, sessionCookieFor } from "../../helpers/http";

const PASSWORD = "Correct-Horse-42";
let passwordHash: string;

beforeEach(async () => {
  passwordHash ??= await hashPassword(PASSWORD);
});

const attemptLogin = (email: string, password: string) =>
  callRoute(loginRoute, { path: "/api/v1/auth/login", body: { email, password } });

function extractCookie(headers: Headers): string {
  const setCookie = headers.get("set-cookie") ?? "";
  return setCookie.split(";")[0];
}

describe("login", () => {
  it("opens a session and sets a hardened cookie", async () => {
    const user = await createUser("STORE_MANAGER", { email: "sm@test.local", passwordHash });

    const res = await attemptLogin("  SM@test.local ", PASSWORD);

    expect(res.status).toBe(200);
    expect(res.json.data).toMatchObject({ user: { id: user.id, email: "sm@test.local", role: "STORE_MANAGER" } });
    expect(JSON.stringify(res.json)).not.toContain("passwordHash");
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toMatch(/^margix_session=[\w-]{20,};/);
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("SameSite=Lax");
    expect(setCookie).not.toContain("Secure");

    const session = await prisma.session.findFirstOrThrow({ where: { userId: user.id } });
    expect(setCookie).not.toContain(session.id);
    expect(await prisma.auditLog.count({ where: { action: "AUTH_LOGIN_SUCCEEDED", userId: user.id } })).toBe(1);
  });

  it("marks the cookie Secure when the request arrived over HTTPS", async () => {
    await createUser("ADMIN", { email: "tls@test.local", passwordHash });
    const res = await callRoute(loginRoute, {
      path: "/api/v1/auth/login",
      body: { email: "tls@test.local", password: PASSWORD },
      headers: { "x-forwarded-proto": "https" },
    });
    expect(res.headers.get("set-cookie")).toContain("Secure");
  });

  it("gives the same answer for a wrong password, an unknown email and an inactive user", async () => {
    await createUser("ADMIN", { email: "a@test.local", passwordHash });
    await createUser("ADMIN", { email: "off@test.local", passwordHash, isActive: false });

    for (const [email, password] of [
      ["a@test.local", "wrong-password"],
      ["nobody@test.local", PASSWORD],
      ["off@test.local", PASSWORD],
    ]) {
      const res = await attemptLogin(email, password);
      expect(res.status).toBe(401);
      expect(res.json.error).toMatchObject({ code: "INVALID_CREDENTIALS", message: "Invalid email or password." });
    }
    expect(await prisma.session.count()).toBe(0);
    expect(await prisma.auditLog.count({ where: { action: "AUTH_LOGIN_FAILED" } })).toBe(3);
  });

  it("locks the account after repeated failures, even for the right password", async () => {
    await createUser("ADMIN", { email: "a@test.local", passwordHash });

    for (let i = 0; i < MAX_FAILED_LOGINS; i++) await attemptLogin("a@test.local", "nope");
    const res = await attemptLogin("a@test.local", PASSWORD);

    expect(res.status).toBe(423);
    expect(res.json.error?.code).toBe("ACCOUNT_LOCKED");
  });

  it("returns a validation envelope for a malformed body", async () => {
    const res = await callRoute(loginRoute, { path: "/api/v1/auth/login", body: { email: "" } });
    expect(res.status).toBe(400);
    expect(res.json).toMatchObject({ success: false, error: { code: "VALIDATION_ERROR" } });
    expect(Array.isArray(res.json.error?.details)).toBe(true);
  });

  it("rejects cross-origin mutations", async () => {
    await createUser("ADMIN", { email: "a@test.local", passwordHash });
    const res = await callRoute(loginRoute, {
      path: "/api/v1/auth/login",
      body: { email: "a@test.local", password: PASSWORD },
      headers: { origin: "https://evil.example" },
    });
    expect(res.status).toBe(403);
  });
});

describe("session", () => {
  it("requires a session for protected routes", async () => {
    const res = await callRoute(meRoute);
    expect(res.status).toBe(401);
    expect(res.json.error?.code).toBe("UNAUTHENTICATED");
  });

  it("returns the current user with their permissions", async () => {
    const user = await createUser("WAREHOUSE_OPERATOR");
    const res = await callRoute<{ user: { id: string }; permissions: string[] }>(meRoute, {
      cookie: await sessionCookieFor(user.id),
    });

    expect(res.status).toBe(200);
    expect(res.json.data?.user.id).toBe(user.id);
    expect(res.json.data?.permissions).toContain("dispatch.create");
    expect(res.json.data?.permissions).not.toContain("adjustment.approve");
  });

  it("rejects expired sessions and sessions of deactivated users", async () => {
    const user = await createUser("ADMIN");
    const cookie = await sessionCookieFor(user.id);
    await prisma.session.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await callRoute(meRoute, { cookie })).status).toBe(401);

    const other = await createUser("ADMIN");
    const otherCookie = await sessionCookieFor(other.id);
    await prisma.user.update({ where: { id: other.id }, data: { isActive: false } });
    expect((await callRoute(meRoute, { cookie: otherCookie })).status).toBe(401);
  });

  it("logout destroys the session and clears the cookie", async () => {
    const user = await createUser("ADMIN");
    const cookie = await sessionCookieFor(user.id);

    const res = await callRoute(logoutRoute, { method: "POST", cookie });

    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).toContain("Max-Age=0");
    expect((await callRoute(meRoute, { cookie })).status).toBe(401);
    expect(extractCookie(res.headers)).toBe("margix_session=");
  });
});
