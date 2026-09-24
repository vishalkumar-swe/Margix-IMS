"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatCompactNumber, formatMoney, formatQuantity } from "@/lib/format";

/**
 * Analytics charts (recharts). Imported only by the analytics route, so the
 * charting library is code-split away from every other page. Values arrive as
 * decimal strings and are converted to numbers for plotting only; tooltips
 * and tables show the exact strings.
 *
 * Palette: brand amber and slate, in a fixed order (colour follows the series,
 * never its rank). Every chart has a legend or a title naming its one series,
 * and a table view (see ChartPanel).
 */
// Theme tokens (not hex), so charts follow light/dark mode (see globals.css).
export const CHART_COLORS = [
  "var(--color-brand-600)",
  "var(--color-slate-700)",
  "var(--color-brand-800)",
  "var(--color-slate-400)",
  "var(--color-brand-400)",
  "var(--color-slate-900)",
] as const;
export const OTHER_COLOR = "var(--color-slate-300)";

const AXIS = { fontSize: 12, fill: "var(--color-slate-500)" };
const GRID = "var(--color-slate-200)";
const TOOLTIP_STYLE = {
  borderRadius: 8,
  borderColor: GRID,
  fontSize: 12,
  background: "var(--glass-strong)",
  color: "var(--color-slate-900)",
  backdropFilter: "blur(12px)",
};

/** Legend labels stay in text ink; the swatch carries the series colour. */
const legendText = (value: string) => <span style={{ color: "var(--color-slate-600)" }}>{value}</span>;

export type ValueFormat = "money" | "quantity";

const formatValue = (value: string | number, format: ValueFormat) =>
  format === "money" ? formatMoney(value) : formatQuantity(value);

export interface ChartSeries {
  key: string;
  label: string;
  /** Index into CHART_COLORS, so a measure keeps its colour across charts (default: position). */
  color?: number;
}

export interface TrendDatum {
  label: string;
  values: Record<string, string>;
}

/** Time series as filled areas (one or two series, one y-axis). */
export function TrendChart({
  data,
  series,
  format = "money",
  height = 260,
  ariaLabel,
}: {
  data: TrendDatum[];
  series: ChartSeries[];
  format?: ValueFormat;
  height?: number;
  ariaLabel: string;
}) {
  const rows = data.map((d) => ({
    label: d.label,
    ...Object.fromEntries(series.map((s) => [s.key, Number(d.values[s.key] ?? 0)])),
    raw: d.values,
  }));
  return (
    <div role="img" aria-label={ariaLabel} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} minTickGap={16} />
          <YAxis tick={AXIS} tickLine={false} axisLine={false} width={56} tickFormatter={formatCompactNumber} />
          <Tooltip
            cursor={{ stroke: "var(--color-slate-400)", strokeDasharray: "3 3" }}
            formatter={(value, name, item) => {
              const key = series.find((s) => s.label === name)?.key;
              const raw = key ? (item.payload as { raw: Record<string, string> }).raw[key] : value;
              return [formatValue(String(raw ?? value), format), name];
            }}
            contentStyle={TOOLTIP_STYLE}
          />
          {series.length > 1 && <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} formatter={legendText} />}
          {series.map((s, index) => (
            <Area
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.label}
              stroke={CHART_COLORS[s.color ?? index]}
              strokeWidth={2}
              fill={CHART_COLORS[s.color ?? index]}
              fillOpacity={series.length > 1 ? 0.08 : 0.15}
              dot={data.length <= 12 ? { r: 3, strokeWidth: 2, fill: "var(--color-white)" } : false}
              activeDot={{ r: 4, stroke: "var(--color-white)", strokeWidth: 2 }}
              isAnimationActive={false}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export interface BarDatum {
  label: string;
  value: string;
}

/** Horizontal bars for top-N breakdowns (one series). */
export function BarBreakdownChart({
  data,
  format = "money",
  seriesLabel,
  ariaLabel,
}: {
  data: BarDatum[];
  format?: ValueFormat;
  seriesLabel: string;
  ariaLabel: string;
}) {
  const rows = data.map((d) => ({ label: d.label, value: Number(d.value), raw: d.value }));
  const height = Math.max(120, rows.length * 34 + 24);
  return (
    <div role="img" aria-label={ariaLabel} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 16, bottom: 0, left: 0 }} barCategoryGap={6}>
          <CartesianGrid stroke={GRID} horizontal={false} />
          <XAxis type="number" tick={AXIS} tickLine={false} axisLine={false} tickFormatter={formatCompactNumber} />
          <YAxis
            type="category"
            dataKey="label"
            tick={AXIS}
            tickLine={false}
            axisLine={false}
            width={120}
            tickFormatter={(v: string) => (v.length > 18 ? `${v.slice(0, 17)}…` : v)}
          />
          <Tooltip
            cursor={{ fill: "var(--color-slate-100)" }}
            formatter={(_value, _name, item) => [formatValue((item.payload as { raw: string }).raw, format), seriesLabel]}
            contentStyle={TOOLTIP_STYLE}
          />
          <Bar dataKey="value" name={seriesLabel} fill={CHART_COLORS[0]} radius={[0, 4, 4, 0]} maxBarSize={22} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Share of a whole (category mix). More than six slices fold into "Other". */
export function DonutChart({ data, ariaLabel }: { data: BarDatum[]; ariaLabel: string }) {
  const positive = data.filter((d) => Number(d.value) > 0);
  const head = positive.slice(0, CHART_COLORS.length - 1);
  const tail = positive.slice(CHART_COLORS.length - 1);
  const slices = [
    ...head.map((d, index) => ({ label: d.label, value: Number(d.value), raw: d.value, color: CHART_COLORS[index] })),
    ...(tail.length === 1
      ? [{ label: tail[0].label, value: Number(tail[0].value), raw: tail[0].value, color: CHART_COLORS[head.length] }]
      : tail.length > 1
        ? [
            {
              label: `Other (${tail.length})`,
              value: tail.reduce((sum, d) => sum + Number(d.value), 0),
              raw: String(tail.reduce((sum, d) => sum + Number(d.value), 0).toFixed(2)),
              color: OTHER_COLOR,
            },
          ]
        : []),
  ];
  return (
    <div role="img" aria-label={ariaLabel} style={{ height: 260 }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={slices}
            dataKey="value"
            nameKey="label"
            innerRadius="58%"
            outerRadius="85%"
            paddingAngle={slices.length > 1 ? 1 : 0}
            stroke="var(--color-white)"
            strokeWidth={2}
            isAnimationActive={false}
          >
            {slices.map((slice) => (
              <Cell key={slice.label} fill={slice.color} />
            ))}
          </Pie>
          <Tooltip
            formatter={(_value, name, item) => [formatMoney((item.payload as { raw: string }).raw), name]}
            contentStyle={TOOLTIP_STYLE}
          />
          <Legend iconType="circle" layout="vertical" align="right" verticalAlign="middle" wrapperStyle={{ fontSize: 12 }} formatter={legendText} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
