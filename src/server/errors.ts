/**
 * Domain errors. Every error that reaches an API client is an AppError with a
 * stable machine-readable `code` (spec §10.4); anything else becomes
 * INTERNAL_ERROR.
 */
export type ErrorCode =
  | "VALIDATION_ERROR"
  | "UNAUTHENTICATED"
  | "INVALID_CREDENTIALS"
  | "ACCOUNT_LOCKED"
  | "FORBIDDEN"
  | "MAKER_CHECKER_VIOLATION"
  | "NOT_FOUND"
  | "DUPLICATE"
  | "INVALID_STATE"
  | "ALREADY_REVERSED"
  | "CANNOT_REVERSE"
  | "INSUFFICIENT_STOCK"
  | "OVER_RECEIPT"
  | "BATCH_MISMATCH"
  | "IMMUTABLE_RECORD"
  | "INTERNAL_ERROR";

export type ErrorDetails = Record<string, unknown> | unknown[];

export class AppError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly status: number,
    readonly details?: ErrorDetails,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: ErrorDetails) {
    super("VALIDATION_ERROR", message, 400, details);
  }
}

export class AuthenticationError extends AppError {
  constructor(
    code: "UNAUTHENTICATED" | "INVALID_CREDENTIALS" | "ACCOUNT_LOCKED" = "UNAUTHENTICATED",
    message = "Authentication required.",
  ) {
    super(code, message, code === "ACCOUNT_LOCKED" ? 423 : 401);
  }
}

export class ForbiddenError extends AppError {
  constructor(
    message = "You do not have permission to perform this action.",
    code: "FORBIDDEN" | "MAKER_CHECKER_VIOLATION" = "FORBIDDEN",
  ) {
    super(code, message, 403);
  }
}

export class NotFoundError extends AppError {
  constructor(entity: string, id?: string) {
    super("NOT_FOUND", `${entity} not found.`, 404, id ? { id } : undefined);
  }
}

/** Returns `value`, or throws NOT_FOUND when it is null/undefined. */
export function assertFound<T>(value: T | null | undefined, entity: string, id?: string): T {
  if (value === null || value === undefined) throw new NotFoundError(entity, id);
  return value;
}

export class ConflictError extends AppError {
  constructor(
    code: "DUPLICATE" | "INVALID_STATE" | "ALREADY_REVERSED" | "CANNOT_REVERSE" | "BATCH_MISMATCH" | "IMMUTABLE_RECORD",
    message: string,
    details?: ErrorDetails,
  ) {
    super(code, message, 409, details);
  }
}

export interface InsufficientStockDetails extends Record<string, unknown> {
  sku: string;
  godown: string;
  batch: string;
  available: string;
  requested: string;
}

export class InsufficientStockError extends AppError {
  constructor(details: InsufficientStockDetails) {
    super("INSUFFICIENT_STOCK", "Requested quantity exceeds available batch stock.", 409, details);
  }
}

export class BusinessRuleError extends AppError {
  constructor(code: "OVER_RECEIPT", message: string, details?: ErrorDetails) {
    super(code, message, 422, details);
  }
}
