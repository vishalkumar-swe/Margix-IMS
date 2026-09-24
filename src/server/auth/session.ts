import { createHash, randomBytes } from "node:crypto";
import type { RoleCode } from "@prisma/client";
import { getEnv } from "@/server/config/env";
import { prisma } from "@/server/db/client";

export const SESSION_COOKIE_NAME = "margix_session";
/** Hard cap on a session's life regardless of activity. */
export const SESSION_ABSOLUTE_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;

/** The authenticated user as exposed to the application (never includes secrets). */
export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: RoleCode;
}

export interface SessionMetadata {
  ipAddress?: string | null;
  userAgent?: string | null;
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function idleTimeoutMs(): number {
  return getEnv().SESSION_TTL_HOURS * 60 * 60 * 1000;
}

/**
 * Creates a database session. Only the SHA-256 of the token is stored, so a
 * database leak cannot be replayed as live sessions.
 */
export async function createSession(
  userId: string,
  meta: SessionMetadata = {},
): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + idleTimeoutMs());
  await prisma.session.create({
    data: {
      id: hashToken(token),
      userId,
      expiresAt,
      ipAddress: meta.ipAddress ?? null,
      userAgent: meta.userAgent?.slice(0, 500) ?? null,
    },
  });
  return { token, expiresAt };
}

/**
 * Resolves a session token to its user. Expiry is sliding (idle timeout)
 * within an absolute lifetime; inactive users are rejected immediately.
 */
export async function validateSessionToken(token: string): Promise<SessionUser | null> {
  const id = hashToken(token);
  const session = await prisma.session.findUnique({
    where: { id },
    include: { user: { select: { id: true, name: true, email: true, isActive: true, role: { select: { code: true } } } } },
  });
  if (!session) return null;

  const now = Date.now();
  const absoluteExpiry = session.createdAt.getTime() + SESSION_ABSOLUTE_LIFETIME_MS;
  if (session.expiresAt.getTime() <= now || absoluteExpiry <= now || !session.user.isActive) {
    await prisma.session.deleteMany({ where: { id } });
    return null;
  }

  // Extend the idle window once more than half of it has elapsed (limits writes).
  const idle = idleTimeoutMs();
  if (session.expiresAt.getTime() - now < idle / 2) {
    await prisma.session.update({
      where: { id },
      data: { expiresAt: new Date(Math.min(now + idle, absoluteExpiry)), lastSeenAt: new Date(now) },
    });
  }

  const { user } = session;
  return { id: user.id, name: user.name, email: user.email, role: user.role.code };
}

export async function deleteSession(token: string): Promise<void> {
  await prisma.session.deleteMany({ where: { id: hashToken(token) } });
}

/** Signs a user out everywhere (deactivation, password change). */
export async function deleteUserSessions(userId: string): Promise<void> {
  await prisma.session.deleteMany({ where: { userId } });
}

/** Signs a user out of every session except the one making the request. */
export async function deleteOtherSessions(userId: string, keepToken: string): Promise<void> {
  await prisma.session.deleteMany({ where: { userId, id: { not: hashToken(keepToken) } } });
}

/** Reads the session token from a raw Cookie header. */
export function readSessionToken(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === SESSION_COOKIE_NAME) return decodeURIComponent(rest.join("=")) || null;
  }
  return null;
}
