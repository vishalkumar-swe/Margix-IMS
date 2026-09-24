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
