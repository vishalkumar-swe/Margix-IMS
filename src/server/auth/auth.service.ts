import { prisma } from "@/server/db/client";
import { withTx } from "@/server/db/transaction";
import { AuthenticationError } from "@/server/errors";
import { recordAudit } from "@/server/modules/audit/audit.service";
import { getDummyPasswordHash, verifyPassword } from "./password";
import { createSession, deleteSession, type SessionMetadata, type SessionUser } from "./session";

export const MAX_FAILED_LOGINS = 5;
export const LOCKOUT_DURATION_MS = 15 * 60 * 1000;

export interface LoginResult {
  user: SessionUser;
  token: string;
  expiresAt: Date;
}

/**
 * Verifies credentials and opens a session. Unknown email, wrong password and
 * inactive account all produce the same INVALID_CREDENTIALS error so accounts
 * cannot be enumerated; repeated failures lock the account temporarily.
 * Failed attempts are audited (committed before the error is thrown).
 */
export async function login(email: string, password: string, meta: SessionMetadata): Promise<LoginResult> {
  const normalisedEmail = email.trim().toLowerCase();
  const user = await prisma.user.findUnique({
    where: { email: normalisedEmail },
    select: {
      id: true,
      name: true,
      email: true,
      passwordHash: true,
      isActive: true,
      lockedUntil: true,
      role: { select: { code: true } },
    },
  });

  if (!user) {
    await verifyPassword(password, await getDummyPasswordHash());
    await auditFailure(null, normalisedEmail, "UNKNOWN_EMAIL", meta);
    throw new AuthenticationError("INVALID_CREDENTIALS", "Invalid email or password.");
  }

  if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
    await auditFailure(user.id, normalisedEmail, "ACCOUNT_LOCKED", meta);
    throw new AuthenticationError(
      "ACCOUNT_LOCKED",
      "Too many failed attempts. The account is temporarily locked; try again later.",
    );
  }

  const passwordOk = await verifyPassword(password, user.passwordHash);
  if (!passwordOk || !user.isActive) {
    await registerFailedAttempt(user.id, normalisedEmail, passwordOk ? "INACTIVE" : "WRONG_PASSWORD", meta);
    throw new AuthenticationError("INVALID_CREDENTIALS", "Invalid email or password.");
  }

  await withTx(async (tx) => {
    await tx.user.update({
      where: { id: user.id },
      data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() },
    });
    await recordAudit(tx, { userId: user.id, role: user.role.code, ...meta }, {
      action: "AUTH_LOGIN_SUCCEEDED",
      entityType: "User",
      entityId: user.id,
    });
  });

  const { token, expiresAt } = await createSession(user.id, meta);
  return {
    user: { id: user.id, name: user.name, email: user.email, role: user.role.code },
    token,
    expiresAt,
  };
}

export async function logout(token: string, user: SessionUser | null, meta: SessionMetadata): Promise<void> {
  await deleteSession(token);
  if (user) {
    await withTx((tx) =>
      recordAudit(tx, { userId: user.id, role: user.role, ...meta }, {
        action: "AUTH_LOGOUT",
        entityType: "User",
        entityId: user.id,
      }),
    );
  }
}

async function registerFailedAttempt(
  userId: string,
  email: string,
  reason: string,
  meta: SessionMetadata,
): Promise<void> {
  await withTx(async (tx) => {
    const rows = await tx.$queryRaw<{ failed_login_count: number }[]>`
      UPDATE "app_user" SET "failed_login_count" = "failed_login_count" + 1
      WHERE "id" = ${userId}::uuid
      RETURNING "failed_login_count"`;
    if (rows[0].failed_login_count >= MAX_FAILED_LOGINS) {
      await tx.user.update({
        where: { id: userId },
        data: { failedLoginCount: 0, lockedUntil: new Date(Date.now() + LOCKOUT_DURATION_MS) },
      });
    }
    await recordAudit(tx, null, {
      action: "AUTH_LOGIN_FAILED",
      entityType: "User",
      entityId: userId,
      newData: { email, reason, ipAddress: meta.ipAddress ?? null },
    });
  });
}

async function auditFailure(userId: string | null, email: string, reason: string, meta: SessionMetadata) {
  await withTx((tx) =>
    recordAudit(tx, null, {
      action: "AUTH_LOGIN_FAILED",
      entityType: "User",
      entityId: userId,
      newData: { email, reason, ipAddress: meta.ipAddress ?? null },
    }),
  );
}
