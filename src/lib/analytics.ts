import { addDays, dateOnlyToUtc, startOfMonth, utcToDateOnly } from "./dates";

/**
 * Analytics periods, time buckets and comparisons. Pure and isomorphic: the
 * analytics queries, the API and the charts all bucket and compare the same way.
 * Every date is an IST calendar day as "YYYY-MM-DD"; periods are inclusive.
 */

export const ANALYTICS_TABS = ["overview", "inventory", "sales", "purchasing"] as const;
export type AnalyticsTab = (typeof ANALYTICS_TABS)[number];

export const ANALYTICS_TAB_LABELS: Record<AnalyticsTab, string> = {
  overview: "Overview",
  inventory: "Inventory",
  sales: "Sales",
  purchasing: "Purchasing",
};

export const PERIOD_PRESETS = ["today", "7d", "30d", "month", "quarter", "fy", "custom"] as const;
export type PeriodPreset = (typeof PERIOD_PRESETS)[number];

export const PERIOD_PRESET_LABELS: Record<PeriodPreset, string> = {
  today: "Today",
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  month: "This month",
  quarter: "This quarter",
  fy: "This financial year",
  custom: "Custom range",
};

export const DEFAULT_PERIOD_PRESET: Exclude<PeriodPreset, "custom"> = "30d";

/** Longest custom range accepted (keeps bucket series and scans bounded). */
export const MAX_PERIOD_DAYS = 3 * 366;

/** CSV sections of GET /api/v1/analytics/export. */
export const ANALYTICS_EXPORT_SECTIONS = [
  "kpis",
  "sales-trend",
  "sales-by-product",
  "sales-by-customer",
  "sales-by-category",
  "purchase-trend",
  "purchases-by-supplier",
  "pending-purchase-orders",
  "inventory-valuation",
  "stock-movement-trend",
  "fast-moving",
  "slow-moving",
  "dead-stock",
  "stock-ageing",
  "low-stock",
  "out-of-stock",
] as const;
export type AnalyticsExportSection = (typeof ANALYTICS_EXPORT_SECTIONS)[number];

export interface Period {
  from: string;
  to: string;
}

export type Granularity = "day" | "week" | "month";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** First day (1 April) of the Indian financial year (April–March) containing `date`. */
export function financialYearStart(date: string): string {
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  return `${month >= 4 ? year : year - 1}-04-01`;
}

/** First day of the quarter containing `date`. Calendar and Indian-FY quarters share boundaries (Apr, Jul, Oct, Jan). */
export function quarterStart(date: string): string {
  const month = Number(date.slice(5, 7));
  const first = month - ((month - 1) % 3);
  return `${date.slice(0, 4)}-${String(first).padStart(2, "0")}-01`;
}

/** The period a preset denotes, ending today ("to date" for month, quarter and FY). */
export function presetPeriod(preset: Exclude<PeriodPreset, "custom">, today: string): Period {
  switch (preset) {
    case "today":
      return { from: today, to: today };
    case "7d":
      return { from: addDays(today, -6), to: today };
    case "30d":
      return { from: addDays(today, -29), to: today };
    case "month":
      return { from: startOfMonth(today), to: today };
    case "quarter":
      return { from: quarterStart(today), to: today };
    case "fy":
      return { from: financialYearStart(today), to: today };
  }
}

/**
 * Resolves the period from page/API input: explicit from/to win (custom),
 * otherwise the preset (default: last 30 days).
 */
export function resolvePeriod(
  input: { preset?: PeriodPreset; from?: string; to?: string },
  today: string,
): { preset: PeriodPreset; period: Period } {
  if (input.preset === "custom" || (!input.preset && (input.from || input.to))) {
    const to = input.to ?? today;
    const from = input.from ?? (input.to ? startOfMonth(to) : addDays(today, -29));
    const period = from <= to ? { from, to } : { from: to, to: from };
    if (periodDays(period) > MAX_PERIOD_DAYS) period.from = addDays(period.to, -(MAX_PERIOD_DAYS - 1));
    return { preset: "custom", period };
  }
  const preset = input.preset ?? DEFAULT_PERIOD_PRESET;
  return { preset, period: presetPeriod(preset, today) };
}

/** Number of calendar days in an inclusive period. */
export function periodDays(period: Period): number {
  return Math.round((dateOnlyToUtc(period.to).getTime() - dateOnlyToUtc(period.from).getTime()) / 86_400_000) + 1;
}

/** The period of equal length immediately before `period` (for "vs previous period"). */
export function previousPeriod(period: Period): Period {
  const days = periodDays(period);
  return { from: addDays(period.from, -days), to: addDays(period.from, -1) };
}

/** Daily buckets up to a month, weekly up to ~6 months, monthly beyond. */
export function granularityFor(period: Period): Granularity {
  const days = periodDays(period);
  if (days <= 31) return "day";
  if (days <= 183) return "week";
  return "month";
}

/** Bucket a day falls in: the day itself, the Monday of its week, or the 1st of its month. */
export function bucketKey(date: string, granularity: Granularity): string {
  if (granularity === "day") return date;
  if (granularity === "month") return startOfMonth(date);
  const weekday = dateOnlyToUtc(date).getUTCDay(); // 0 = Sunday
  return addDays(date, -((weekday + 6) % 7));
}

/** Every bucket touching the period, in order (empty buckets included). */
export function bucketKeys(period: Period, granularity: Granularity): string[] {
  const keys: string[] = [];
  let key = bucketKey(period.from, granularity);
  while (key <= period.to) {
    keys.push(key);
    if (granularity === "day") key = addDays(key, 1);
    else if (granularity === "week") key = addDays(key, 7);
    else {
      const next = dateOnlyToUtc(key);
      next.setUTCMonth(next.getUTCMonth() + 1);
      key = utcToDateOnly(next);
    }
  }
  return keys;
}

/** Axis/table label of a bucket, e.g. "24 Sep", "w/c 21 Sep", "Sep 2026". */
export function bucketLabel(key: string, granularity: Granularity): string {
  const day = Number(key.slice(8, 10));
  const month = MONTHS[Number(key.slice(5, 7)) - 1];
  if (granularity === "month") return `${month} ${key.slice(0, 4)}`;
  return granularity === "week" ? `w/c ${day} ${month}` : `${day} ${month}`;
}

/**
 * Percentage change from `previous` to `current` (decimal strings), rounded
 * to one decimal. Null when there is no base to compare with.
 */
export function percentChange(current: string, previous: string): number | null {
  const now = Number(current);
  const before = Number(previous);
  if (!Number.isFinite(now) || !Number.isFinite(before) || before === 0) return now === before ? 0 : null;
  return Math.round(((now - before) / Math.abs(before)) * 1000) / 10;
}

/** One point of a time series: a bucket and its values (decimal strings). */
export interface TrendPoint {
  bucket: string;
  label: string;
  values: Record<string, string>;
}

/**
 * Lays sparse SQL rows (one per non-empty bucket) onto the full bucket series,
 * filling gaps with "0" so charts show quiet days as zero, not as missing.
 */
export function fillSeries(
  period: Period,
  granularity: Granularity,
  rows: { bucket: string; [series: string]: string }[],
  series: string[],
): TrendPoint[] {
  const byBucket = new Map(rows.map((row) => [row.bucket, row]));
  return bucketKeys(period, granularity).map((bucket) => {
    const row = byBucket.get(bucket);
    return {
      bucket,
      label: bucketLabel(bucket, granularity),
      values: Object.fromEntries(series.map((name) => [name, row?.[name] ?? "0"])),
    };
  });
}
