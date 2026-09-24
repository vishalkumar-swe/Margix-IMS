import { Prisma } from "@prisma/client";

export interface PgErrorInfo {
  /** Postgres SQLSTATE, e.g. "23514" (check violation), "40P01" (deadlock). */
  code: string;
  /** Constraint name when Postgres reports one. */
  constraint?: string;
  message: string;
}

/**
 * Extracts the underlying Postgres error from a Prisma error. Prisma surfaces
 * database errors in several shapes depending on the query API used, so this
 * normalises them for error mapping and retry decisions.
 */
export function getPgError(error: unknown): PgErrorInfo | null {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    // Raw queries: P2010 carries the SQLSTATE in meta.code.
    const meta = error.meta as { code?: unknown; message?: unknown } | undefined;
    if (error.code === "P2010" && typeof meta?.code === "string") {
      const message = typeof meta.message === "string" ? meta.message : error.message;
      return { code: meta.code, constraint: extractConstraint(message), message };
    }
    if (error.code === "P2034") {
      return { code: "40001", message: error.message };
    }
    return null;
  }

  if (
    error instanceof Prisma.PrismaClientUnknownRequestError ||
    error instanceof Prisma.PrismaClientKnownRequestError
  ) {
    const match = /code: "([0-9A-Z]{5})"/.exec(error.message);
    if (match) {
      return { code: match[1], constraint: extractConstraint(error.message), message: error.message };
    }
  }
  return null;
}

function extractConstraint(message: string): string | undefined {
  return /constraint \\?"([a-z0-9_]+)\\?"/i.exec(message)?.[1];
}

export function isUniqueViolation(error: unknown, field?: string): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") {
    return false;
  }
  if (!field) return true;
  const target = (error.meta as { target?: unknown } | undefined)?.target;
  if (Array.isArray(target)) return target.includes(field);
  return typeof target === "string" && target.includes(field);
}
