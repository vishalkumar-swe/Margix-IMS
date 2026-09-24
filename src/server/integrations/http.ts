/**
 * Outbound HTTP for integrations: a timeout on every call and one error shape
 * that says whether a retry could help. Use this instead of bare fetch().
 */

export class IntegrationHttpError extends Error {
  constructor(
    message: string,
    /** Whether the same request may succeed later (network, timeout, 5xx, 429). */
    readonly retryable: boolean,
    readonly status?: number,
    readonly body?: string,
  ) {
    super(message);
    this.name = "IntegrationHttpError";
  }
}

export interface IntegrationFetchOptions {
  /** Service name for messages, e.g. "Tally Prime". */
  service: string;
  timeoutMs: number;
  fetchImpl?: typeof fetch;
}

/**
 * fetch() with a timeout. Resolves with the response for 2xx; throws
 * IntegrationHttpError for network errors, timeouts and non-2xx responses
 * (body text included, truncated).
 */
export async function integrationFetch(url: string, init: RequestInit, options: IntegrationFetchOptions): Promise<Response> {
  const fetchImpl = options.fetchImpl ?? fetch;
  let response: Response;
  try {
    response = await fetchImpl(url, { ...init, signal: AbortSignal.timeout(options.timeoutMs) });
  } catch (error) {
    const timedOut = error instanceof DOMException && error.name === "TimeoutError";
    throw new IntegrationHttpError(
      timedOut
        ? `${options.service} did not respond within ${Math.round(options.timeoutMs / 1000)} seconds.`
        : `${options.service} could not be reached (${error instanceof Error ? error.message : String(error)}).`,
      true,
    );
  }
  if (!response.ok) {
    const body = truncate(await response.text().catch(() => ""), 1000);
    throw new IntegrationHttpError(
      `${options.service} returned HTTP ${response.status}.`,
      response.status >= 500 || response.status === 429 || response.status === 408,
      response.status,
      body,
    );
  }
  return response;
}

/** Error text safe to store and show: no stack, bounded length. */
export function describeIntegrationError(error: unknown): string {
  return truncate(error instanceof Error ? error.message : String(error), 500);
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}
