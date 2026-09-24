import type { RoleCode } from "@prisma/client";

/** The authenticated user performing an operation, plus request metadata for audit. */
export interface Actor {
  userId: string;
  role: RoleCode;
  ipAddress?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
}
