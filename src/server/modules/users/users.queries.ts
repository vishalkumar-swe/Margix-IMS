import type { Prisma } from "@prisma/client";
import { prisma } from "@/server/db/client";

/** The only user shape that may leave the server — never includes the password hash. */
export const publicUserSelect = {
  id: true,
  name: true,
  email: true,
  mobile: true,
  isActive: true,
  lockedUntil: true,
  lastLoginAt: true,
  createdAt: true,
  role: { select: { code: true, name: true } },
} satisfies Prisma.UserSelect;

export type PublicUser = Prisma.UserGetPayload<{ select: typeof publicUserSelect }>;

/** Minimal reference to a user on documents ("created by …"). */
export const userRefSelect = { id: true, name: true } satisfies Prisma.UserSelect;

export function listUsers() {
  return prisma.user.findMany({ orderBy: { name: "asc" }, select: publicUserSelect });
}

export function getUser(id: string) {
  return prisma.user.findUnique({ where: { id }, select: publicUserSelect });
}
