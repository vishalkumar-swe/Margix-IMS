import { Prisma } from "@prisma/client";
import { ZodError } from "zod";
import { getPgError } from "@/server/db/pg-error";
import { toPlainJson } from "@/server/db/serialize";
import { AppError, ConflictError, NotFoundError, ValidationError } from "@/server/errors";

/** Success envelope: { success: true, data }. */
export function jsonSuccess(data: unknown, status = 200, headers?: HeadersInit): Response {
  return Response.json({ success: true, data: toPlainJson(data) }, { status, headers });
}

/** Error envelope (spec §10.4): { success: false, error: { code, message, details } }. */
export function jsonError(error: AppError, headers?: HeadersInit): Response {
  return Response.json(
    {
      success: false,
      error: { code: error.code, message: error.message, details: toPlainJson(error.details ?? null) },
    },
    { status: error.status, headers },
  );
}

/**
 * Normalises any thrown value into an AppError. Database-level integrity
 * violations (the last line of defence) are translated into stable codes;
 * anything unexpected becomes INTERNAL_ERROR without leaking internals.
 */
export function toAppError(error: unknown): AppError {
  if (error instanceof AppError) return error;

  if (error instanceof ZodError) {
    return new ValidationError(
      "The request is invalid.",
      error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
    );
  }

  if (error instanceof SyntaxError) {
    return new ValidationError("The request body is not valid JSON.");
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") {
      return new ConflictError("DUPLICATE", "A record with the same unique value already exists.", {
        target: (error.meta as { target?: unknown } | undefined)?.target ?? null,
      });
    }
    if (error.code === "P2025") return new NotFoundError("Record");
    if (error.code === "P2023") return new ValidationError("A malformed identifier was supplied.");
  }

  const pg = getPgError(error);
  if (pg) {
    if (pg.code === "55000") {
      return new ConflictError("IMMUTABLE_RECORD", "Posted records cannot be modified or deleted.");
    }
    if (pg.code === "23514" && pg.constraint && /non_negative|balance_after/.test(pg.constraint)) {
      return new AppError("INSUFFICIENT_STOCK", "Requested quantity exceeds available batch stock.", 409);
    }
    if (pg.code === "23514") {
      return new ValidationError("The request violates a data integrity rule.", {
        constraint: pg.constraint ?? null,
      });
    }
    if (pg.code === "23503") {
      return new ValidationError("A referenced record does not exist.", { constraint: pg.constraint ?? null });
    }
  }

  return new AppError("INTERNAL_ERROR", "An unexpected error occurred.", 500);
}
