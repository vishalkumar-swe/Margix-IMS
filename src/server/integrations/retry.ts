/**
 * Retry schedule shared by every integration outbox (Tally jobs, notification
 * messages, webhook deliveries): exponential backoff, capped.
 */

export interface RetryPolicy {
  /** Give up after this many attempts (the item is marked FAILED; admins can retry it). */
  maxAttempts: number;
  baseMinutes: number;
  maxMinutes: number;
}

export const DEFAULT_RETRY_POLICY: RetryPolicy = { maxAttempts: 6, baseMinutes: 2, maxMinutes: 60 };

/** Minutes to wait after the given attempt number (1-based): 2, 4, 8, … capped. */
export function retryDelayMinutes(attempt: number, policy: RetryPolicy = DEFAULT_RETRY_POLICY): number {
  return Math.min(policy.baseMinutes * 2 ** Math.max(0, attempt - 1), policy.maxMinutes);
}

export function nextAttemptAt(attempt: number, now: Date = new Date(), policy: RetryPolicy = DEFAULT_RETRY_POLICY): Date {
  return new Date(now.getTime() + retryDelayMinutes(attempt, policy) * 60_000);
}

export function shouldGiveUp(attempt: number, policy: RetryPolicy = DEFAULT_RETRY_POLICY): boolean {
  return attempt >= policy.maxAttempts;
}
