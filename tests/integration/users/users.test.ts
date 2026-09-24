import { describe, expect, it } from "vitest";
import { prisma } from "@/server/db/client";
import type { AppError } from "@/server/errors";
import { createUser as createUserAccount, resetPassword, updateUser } from "@/server/modules/users/users.service";
import { actorFor, createUser } from "../../helpers/factories";
import { sessionCookieFor } from "../../helpers/http";

const errorCode = (p: Promise<unknown>) => p.then(() => "OK", (e: AppError) => e.code);

describe("user administration", () => {
  it("creates users without ever returning the password hash", async () => {
    const admin = actorFor(await createUser("ADMIN"));
    await prisma.role.upsert({ where: { code: "ACCOUNTS" }, update: {}, create: { code: "ACCOUNTS", name: "Accounts" } });

    const user = await createUserAccount(admin, {
      name: "Asha",
      email: "asha@test.local",
      role: "ACCOUNTS",
      password: "Ledger-2026-ok",
    });

    expect(user).not.toHaveProperty("passwordHash");
    expect(user.role.code).toBe("ACCOUNTS");
  });

  it("keeps sessions on profile edits but ends them on role change or deactivation", async () => {
    const admin = actorFor(await createUser("ADMIN"));
    const target = await createUser("WAREHOUSE_OPERATOR");
    await prisma.role.upsert({ where: { code: "STORE_MANAGER" }, update: {}, create: { code: "STORE_MANAGER", name: "SM" } });
    await sessionCookieFor(target.id);

    await updateUser(admin, target.id, { name: "Renamed", role: "WAREHOUSE_OPERATOR" });
    expect(await prisma.session.count({ where: { userId: target.id } })).toBe(1);

    await updateUser(admin, target.id, { role: "STORE_MANAGER" });
    expect(await prisma.session.count({ where: { userId: target.id } })).toBe(0);

    await sessionCookieFor(target.id);
    await updateUser(admin, target.id, { isActive: false });
    expect(await prisma.session.count({ where: { userId: target.id } })).toBe(0);
  });

  it("does not let administrators lock themselves out", async () => {
    const adminUser = await createUser("ADMIN");
    const admin = actorFor(adminUser);
    expect(await errorCode(updateUser(admin, adminUser.id, { isActive: false }))).toBe("INVALID_STATE");
    expect(await errorCode(updateUser(admin, adminUser.id, { role: "ACCOUNTS" }))).toBe("INVALID_STATE");
    expect(await errorCode(updateUser(admin, adminUser.id, { name: "Still me", role: "ADMIN" }))).toBe("OK");
  });

  it("password reset clears lockout and signs the user out", async () => {
    const admin = actorFor(await createUser("ADMIN"));
    const target = await createUser("ACCOUNTS");
    await prisma.user.update({ where: { id: target.id }, data: { lockedUntil: new Date(Date.now() + 60_000), failedLoginCount: 3 } });
    await sessionCookieFor(target.id);

    await resetPassword(admin, target.id, "Fresh-Start-99");

    const after = await prisma.user.findUniqueOrThrow({ where: { id: target.id } });
    expect(after.lockedUntil).toBeNull();
    expect(after.failedLoginCount).toBe(0);
    expect(await prisma.session.count({ where: { userId: target.id } })).toBe(0);
    expect(await prisma.auditLog.count({ where: { action: "USER_PASSWORD_RESET", entityId: target.id } })).toBe(1);
  });
});
