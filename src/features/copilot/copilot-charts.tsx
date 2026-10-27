"use client";

import { BarChart3, TrendingUp, GitFork, ArrowRight } from "lucide-react";

export interface ChartItem {
  label: string;
  value: number;
  formattedValue?: string;
  sublabel?: string;
  color?: "emerald" | "blue" | "purple" | "amber" | "rose" | "cyan" | string;
  badge?: string;
}

const COLOR_MAP: Record<string, { bar: string; text: string; bg: string }> = {
  emerald: { bar: "from-emerald-500 to-teal-600", text: "text-emerald-700", bg: "bg-emerald-50 border-emerald-200" },
  blue: { bar: "from-blue-500 to-indigo-600", text: "text-blue-700", bg: "bg-blue-50 border-blue-200" },
  purple: { bar: "from-purple-500 to-violet-600", text: "text-purple-700", bg: "bg-purple-50 border-purple-200" },
  amber: { bar: "from-amber-500 to-orange-500", text: "text-amber-800", bg: "bg-amber-50 border-amber-200" },
  rose: { bar: "from-rose-500 to-pink-600", text: "text-rose-700", bg: "bg-rose-50 border-rose-200" },
  cyan: { bar: "from-cyan-500 to-sky-600", text: "text-cyan-700", bg: "bg-cyan-50 border-cyan-200" },
};

const DEFAULT_PALETTE = ["emerald", "blue", "purple", "amber", "rose", "cyan"];

/**
 * Visual Bar Chart Component
 * Highly accessible, responsive, colored horizontal bar chart tailored for drawer width.
 * Illiterate or non-technical business owners can immediately grasp relative magnitudes.
 */
export function VisualBarChart({
  title,
  unit,
  items,
}: {
  title?: string;
  unit?: string;
  items: ChartItem[];
}) {
  if (!items || !Array.isArray(items) || items.length === 0) return null;

  const validItems = items.filter(
    (i) => i && typeof i === "object" && typeof i.label === "string" && i.label.length > 0,
  );
  if (validItems.length === 0) return null;

  const maxValue = Math.max(
    ...validItems.map((i) => (typeof i.value === "number" && Number.isFinite(i.value) ? i.value : 0)),
    1,
  );

  return (
    <div className="my-3 overflow-hidden rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm transition-all hover:shadow-md">
      {title && (
        <div className="mb-3 flex items-center justify-between border-b border-slate-100 pb-2">
          <div className="flex items-center gap-2">
            <span className="flex size-6 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
              <BarChart3 className="size-3.5" />
            </span>
            <h4 className="font-semibold text-xs text-slate-900 tracking-tight">{title}</h4>
          </div>
          {unit && (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
              {unit}
            </span>
          )}
        </div>
      )}

      <div className="space-y-2.5">
        {validItems.map((item, idx) => {
          const numVal = typeof item.value === "number" && Number.isFinite(item.value) ? item.value : 0;
          const pct = Math.max(Math.min(Math.round((numVal / maxValue) * 100), 100), 4);
          const colorKey = item.color || DEFAULT_PALETTE[idx % DEFAULT_PALETTE.length];
          const colorStyle = COLOR_MAP[colorKey] || COLOR_MAP.blue;

          const formattedDisplay = item.formattedValue
            ? String(item.formattedValue).replace(/\*\*/g, "").replace(/`/g, "")
            : numVal.toLocaleString("en-IN");

          return (
            <div key={`${item.label}-${idx}`} className="group">
              <div className="mb-1 flex items-baseline justify-between text-xs">
                <div className="flex items-center gap-1.5 min-w-0 pr-2">
                  <span className="font-medium text-slate-800 truncate">{item.label}</span>
                  {item.badge && (
                    <span className={`shrink-0 rounded px-1.5 py-0.2 text-[9px] font-bold uppercase tracking-wider border ${colorStyle.bg} ${colorStyle.text}`}>
                      {item.badge}
                    </span>
                  )}
                </div>
                <span className="font-bold tabular-nums text-slate-900 shrink-0">
                  {formattedDisplay}
                </span>
              </div>

              {/* Visual Percentage Bar */}
              <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
                <div
                  className={`h-full rounded-full bg-gradient-to-r ${colorStyle.bar} transition-all duration-700 ease-out`}
                  style={{ width: `${pct}%` }}
                />
              </div>

              {item.sublabel && (
                <p className="mt-0.5 text-[10px] text-slate-500 truncate">
                  {String(item.sublabel).replace(/\*\*/g, "").replace(/`/g, "")}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Visual Line / Trend Chart Component
 * Lightweight SVG trend chart with shaded gradient area fill.
 */
export function VisualLineChart({
  title,
  data,
}: {
  title?: string;
  data: Array<{ label: string; value: number }>;
}) {
  if (!data || !Array.isArray(data) || data.length < 2) return null;

  const validData = data.filter(
    (d) => d && typeof d === "object" && typeof d.label === "string" && typeof d.value === "number" && Number.isFinite(d.value),
  );
  if (validData.length < 2) return null;

  const width = 360;
  const height = 120;
  const paddingX = 30;
  const paddingY = 20;

  const values = validData.map((d) => d.value);
  const minVal = Math.min(...values);
  const maxVal = Math.max(...values);
  const range = maxVal - minVal || 1;

  const points = validData.map((d, i) => {
    const x = paddingX + (i / (validData.length - 1)) * (width - 2 * paddingX);
    const y = height - paddingY - ((d.value - minVal) / range) * (height - 2 * paddingY);
    return { x, y, ...d };
  });

  if (points.length < 2) return null;

  const pathD = points.reduce((acc, p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `${acc} L ${p.x} ${p.y}`), "");
  const lastPoint = points[points.length - 1];
  const firstPoint = points[0];
  const areaD = `${pathD} L ${lastPoint.x} ${height - paddingY} L ${firstPoint.x} ${height - paddingY} Z`;

  return (
    <div className="my-3 overflow-hidden rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm">
      {title && (
        <div className="mb-2 flex items-center justify-between border-b border-slate-100 pb-2">
          <div className="flex items-center gap-2">
            <span className="flex size-6 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
              <TrendingUp className="size-3.5" />
            </span>
            <h4 className="font-semibold text-xs text-slate-900 tracking-tight">{title}</h4>
          </div>
          <span className="text-[10px] tabular-nums font-semibold text-slate-600">
            Min: {minVal.toLocaleString("en-IN")} • Max: {maxVal.toLocaleString("en-IN")}
          </span>
        </div>
      )}

      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto overflow-visible">
        <defs>
          <linearGradient id="copilotLineGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#10b981" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
          </linearGradient>
        </defs>

        {/* Shaded Area */}
        <path d={areaD} fill="url(#copilotLineGrad)" />

        {/* Trend Polyline */}
        <path d={pathD} fill="none" stroke="#059669" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />

        {/* Data Circles & Labels */}
        {points.map((p, idx) => (
          <g key={idx}>
            <circle cx={p.x} cy={p.y} r="3.5" fill="#ffffff" stroke="#059669" strokeWidth="2" />
            <text
              x={p.x}
              y={height - 4}
              fontSize="9"
              textAnchor="middle"
              fill="#64748b"
              fontFamily="sans-serif"
            >
              {p.label}
            </text>
            <text
              x={p.x}
              y={p.y - 7}
              fontSize="9"
              fontWeight="bold"
              textAnchor="middle"
              fill="#0f172a"
              fontFamily="sans-serif"
            >
              {p.value.toLocaleString("en-IN")}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

/**
 * Visual Flowchart / Node Graph
 * Graphical state machine and inventory pipeline representation.
 */
export function VisualFlowGraph({
  title,
  nodes,
}: {
  title?: string;
  nodes: Array<{ step: string; title: string; desc: string; type: "inward" | "ledger" | "outward" | "check" }>;
}) {
  if (!nodes || !Array.isArray(nodes) || nodes.length === 0) return null;

  return (
    <div className="my-3 overflow-hidden rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm">
      {title && (
        <div className="mb-3 flex items-center gap-2 border-b border-slate-100 pb-2">
          <span className="flex size-6 items-center justify-center rounded-lg bg-indigo-50 text-indigo-700">
            <GitFork className="size-3.5" />
          </span>
          <h4 className="font-semibold text-xs text-slate-900 tracking-tight">{title}</h4>
        </div>
      )}

      <div className="flex flex-col gap-2">
        {nodes.map((node, idx) => {
          if (!node || typeof node !== "object") return null;

          const isLedger = node.type === "ledger";
          const isInward = node.type === "inward";
          const isOutward = node.type === "outward";

          const badgeBg = isLedger
            ? "border-purple-200 bg-purple-50 text-purple-800"
            : isInward
            ? "border-emerald-200 bg-emerald-50 text-emerald-800"
            : isOutward
            ? "border-blue-200 bg-blue-50 text-blue-800"
            : "border-amber-200 bg-amber-50 text-amber-800";

          return (
            <div key={idx} className="relative">
              <div className={`flex items-start gap-2.5 rounded-lg border p-2.5 transition-all ${badgeBg}`}>
                <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-white font-bold text-xs shadow-xs text-slate-800">
                  {idx + 1}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-1">
                    <p className="font-bold text-xs text-slate-900">{node.title || "Step"}</p>
                    <span className="rounded bg-white/80 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-slate-700 border border-slate-200">
                      {node.step || `Step ${idx + 1}`}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[11px] leading-snug text-slate-700">{node.desc || ""}</p>
                </div>
              </div>

              {idx < nodes.length - 1 && (
                <div className="my-0.5 flex justify-center text-slate-400">
                  <ArrowRight className="size-3.5 rotate-90" />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Helper to parse chart DSL from fenced code blocks
 */
export function parseChartDSL(content: string, typeHint?: string): {
  type: "bar" | "line" | "flow";
  title?: string;
  unit?: string;
  items?: ChartItem[];
  lineData?: Array<{ label: string; value: number }>;
  flowNodes?: Array<{ step: string; title: string; desc: string; type: "inward" | "ledger" | "outward" | "check" }>;
} | null {
  try {
    const trimmed = content.trim();

    // Check if JSON
    if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
      const parsed = JSON.parse(trimmed);
      return {
        type: parsed.type || (typeHint === "line" ? "line" : typeHint === "flow" ? "flow" : "bar"),
        title: parsed.title,
        unit: parsed.unit,
        items: parsed.data || parsed.items,
        lineData: parsed.lineData || parsed.data,
        flowNodes: parsed.flowNodes || parsed.nodes,
      };
    }

    // Line-by-line key: value DSL
    const lines = trimmed.split("\n").map((l) => l.trim()).filter(Boolean);
    let title: string | undefined;
    let unit: string | undefined;
    const items: ChartItem[] = [];
    const lineData: Array<{ label: string; value: number }> = [];

    for (const line of lines) {
      if (/^title:\s*/i.test(line)) {
        title = line.replace(/^title:\s*/i, "").trim();
        continue;
      }
      if (/^unit:\s*/i.test(line)) {
        unit = line.replace(/^unit:\s*/i, "").trim();
        continue;
      }

      // Format: Label: Value | Sublabel | Color
      const match = line.match(/^([^:|]+):\s*([0-9.,]+)(?:\s*\|\s*([^|]+))?(?:\s*\|\s*([^|]+))?$/);
      if (match) {
        const label = match[1].trim();
        const rawNum = match[2].replace(/,/g, "");
        const value = parseFloat(rawNum);
        const subOrFormatted = match[3]?.trim();
        const extra = match[4]?.trim();

        if (!isNaN(value)) {
          items.push({
            label,
            value,
            formattedValue: subOrFormatted?.startsWith("₹") || subOrFormatted?.includes("/") ? subOrFormatted : undefined,
            sublabel: !subOrFormatted?.startsWith("₹") ? subOrFormatted : extra,
            badge: extra?.toUpperCase(),
          });
          lineData.push({ label, value });
        }
      }
    }

    if (typeHint === "line" && lineData.length >= 2) {
      return { type: "line", title, lineData };
    }

    if (items.length > 0) {
      return { type: "bar", title, unit, items };
    }

    return null;
  } catch {
    return null;
  }
}
