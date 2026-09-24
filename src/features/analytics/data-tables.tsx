import type { ReactNode } from "react";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import type { TrendPoint } from "@/lib/analytics";
import { formatMoney, formatQuantity } from "@/lib/format";

export interface Column<T> {
  header: string;
  numeric?: boolean;
  cell: (row: T) => ReactNode;
}

/** Plain data table: the "view as table" side of charts and the top-N lists. */
export function DataTable<T>({ columns, rows, rowKey }: { columns: Column<T>[]; rows: T[]; rowKey: (row: T) => string }) {
  return (
    <Table>
      <THead>
        <tr>
          {columns.map((c) => (
            <TH key={c.header} numeric={c.numeric}>
              {c.header}
            </TH>
          ))}
        </tr>
      </THead>
      <TBody>
        {rows.map((row) => (
          <TR key={rowKey(row)}>
            {columns.map((c) => (
              <TD key={c.header} numeric={c.numeric}>
                {c.cell(row)}
              </TD>
            ))}
          </TR>
        ))}
      </TBody>
    </Table>
  );
}

/** Time series as a table, one column per series. */
export function TrendTable({
  points,
  series,
}: {
  points: TrendPoint[];
  series: { key: string; label: string; format?: "money" | "quantity" }[];
}) {
  return (
    <DataTable
      rows={points}
      rowKey={(p) => p.bucket}
      columns={[
        { header: "Period", cell: (p) => p.label },
        ...series.map((s) => ({
          header: s.label,
          numeric: true,
          cell: (p: TrendPoint) => (s.format === "quantity" ? formatQuantity(p.values[s.key]) : formatMoney(p.values[s.key])),
        })),
      ]}
    />
  );
}

export function EmptyPanel({ text }: { text: string }) {
  return <p className="px-5 py-10 text-center text-sm text-slate-500">{text}</p>;
}

/** True when every value of every point is zero (nothing to plot). */
export function isFlat(points: TrendPoint[], keys: string[]): boolean {
  return points.every((p) => keys.every((k) => Number(p.values[k] ?? 0) === 0));
}
