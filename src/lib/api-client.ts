/**
 * Browser-side client for /api/v1. Unwraps the { success, data } envelope and
 * turns error envelopes into ApiClientError.
 */

interface ErrorBody {
  code: string;
  message: string;
  details: unknown;
}

export class ApiClientError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details: unknown,
  ) {
    super(message);
    this.name = "ApiClientError";
  }

  /** Validation issues keyed by field path, e.g. { "items.0.quantity": "…" }. */
  get fieldErrors(): Record<string, string> {
    if (this.code !== "VALIDATION_ERROR" || !Array.isArray(this.details)) return {};
    const errors: Record<string, string> = {};
    for (const issue of this.details as { path?: string; message?: string }[]) {
      if (issue.path && issue.message && !errors[issue.path]) errors[issue.path] = issue.message;
    }
    return errors;
  }
}

export async function apiRequest<T>(
  path: string,
  options: { method?: "GET" | "POST" | "PATCH"; body?: unknown } = {},
): Promise<T> {
  const response = await fetch(`/api/v1${path}`, {
    method: options.method ?? (options.body === undefined ? "GET" : "POST"),
    headers: options.body === undefined ? undefined : { "content-type": "application/json" },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    credentials: "same-origin",
  });

  let payload: { success?: boolean; data?: T; error?: ErrorBody } | null = null;
  try {
    payload = await response.json();
  } catch {
    // Non-JSON (e.g. a proxy error page) is handled below.
  }

  if (!response.ok || !payload?.success) {
    const error = payload?.error;
    throw new ApiClientError(
      response.status,
      error?.code ?? "INTERNAL_ERROR",
      error?.message ?? "The server could not complete the request. Please try again.",
      error?.details ?? null,
    );
  }
  return payload.data as T;
}
