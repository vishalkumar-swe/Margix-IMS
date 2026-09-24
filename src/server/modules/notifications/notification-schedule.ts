import type { NotificationFrequency } from "@prisma/client";
import { istDateOf, istTimeOf } from "@/lib/dates";

/**
 * Timing rules of the notification worker (pure functions). All schedules are
 * IST wall-clock times, "HH:MM".
 */

/** After this many automatic attempts a delivery waits for a manual retry. */
export const MAX_DELIVERY_ATTEMPTS = 6;

/** Exponential backoff after the n-th failed attempt: 2, 4, 8 … minutes, capped at an hour. */
/** Shared with every integration outbox (src/server/integrations/retry.ts). */
export { retryDelayMinutes } from "@/server/integrations/retry";

export interface IstClock {
  /** YYYY-MM-DD */
  day: string;
  /** HH:MM */
  time: string;
}

export function istClock(now: Date): IstClock {
  return { day: istDateOf(now), time: istTimeOf(now) };
}

/**
 * A once-a-day job is due when today's scheduled time has passed and it has
 * not yet run today. "HH:MM" strings compare correctly as text.
 */
export function isDailyJobDue(now: Date, scheduledTime: string, lastRunOn: string | null | undefined): boolean {
  const clock = istClock(now);
  return clock.time >= scheduledTime && lastRunOn !== clock.day;
}

/** Whether a newly raised alert is notified right away (otherwise it waits for the digest). */
export function notifiesImmediately(rule: { isEnabled: boolean; frequency: NotificationFrequency }): boolean {
  return rule.isEnabled && rule.frequency === "IMMEDIATE";
}

/** Whether the rule sends a daily digest at all. */
export function sendsDigest(rule: { isEnabled: boolean; frequency: NotificationFrequency }): boolean {
  return rule.isEnabled && rule.frequency === "DAILY_DIGEST";
}
