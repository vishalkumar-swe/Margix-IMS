/**
 * Date helpers. Calendar dates (PO date, expiry, …) are stored as SQL DATE and
 * exchanged as "YYYY-MM-DD"; they are represented in JS as UTC midnight so no
 * timezone can shift the day.
 */

const DISPLAY_TIME_ZONE = "Asia/Kolkata";

export function dateOnlyToUtc(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

export function utcToDateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/** The instant an IST calendar day begins, e.g. "2026-09-24" → 2026-09-23T18:30:00Z. */
export function istDayStart(value: string): Date {
  return new Date(dateOnlyToUtc(value).getTime() - IST_OFFSET_MS);
}

/** Calendar arithmetic on YYYY-MM-DD strings. */
export function addDays(value: string, days: number): string {
  return utcToDateOnly(new Date(dateOnlyToUtc(value).getTime() + days * 24 * 60 * 60 * 1000));
}

/** The IST calendar date (YYYY-MM-DD) of an instant. */
export function istDateOf(instant: Date): string {
  return utcToDateOnly(new Date(instant.getTime() + IST_OFFSET_MS));
}

/** The IST wall-clock time of an instant as "HH:MM" (24-hour). */
export function istTimeOf(instant: Date): string {
  return new Date(instant.getTime() + IST_OFFSET_MS).toISOString().slice(11, 16);
}

/** First day of the IST month containing `value` (YYYY-MM-DD). */
export function startOfMonth(value: string): string {
  return `${value.slice(0, 7)}-01`;
}

/** Today's calendar date in IST as YYYY-MM-DD. */
export function todayIst(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: DISPLAY_TIME_ZONE }).format(new Date());
}

/** e.g. "24 Sep 2026" — for SQL DATE values (UTC midnight). */
export function formatDate(value: Date | string | null | undefined): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).format(
    new Date(value),
  );
}

/** e.g. "24 Sep 2026, 4:05 pm" in IST — for timestamps. */
export function formatDateTime(value: Date | string | null | undefined): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: DISPLAY_TIME_ZONE,
  }).format(new Date(value));
}
