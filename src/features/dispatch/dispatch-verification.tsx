"use client";

import { RotateCcw, Undo2 } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { ScanInput, type ScanStatus } from "@/features/scan/scan-input";
import { lookupErrorMessage, lookupSku } from "@/features/scan/scan-lookup";
import { findByScanCode } from "@/lib/barcode";
import { cn } from "@/lib/cn";
import { formatQuantity } from "@/lib/format";
import { formatScaled, parseScaled } from "@/lib/tax";

export interface VerifiableLine {
  skuId: string;
  code: string;
  name: string;
  barcode: string | null;
  unit: string;
  /** Dispatched quantity (base unit). */
  expected: string;
}

type Outcome = "matched" | "short" | "over" | "extra";

const OUTCOME: Record<Outcome, { label: string; tone: "success" | "warning" | "danger"; row: string }> = {
  matched: { label: "Matched", tone: "success", row: "bg-emerald-50/60" },
  short: { label: "Short", tone: "warning", row: "bg-amber-50/60" },
  over: { label: "Over", tone: "danger", row: "bg-red-50/60" },
  extra: { label: "Extra", tone: "danger", row: "bg-red-50/60" },
};

/** Quantities are compared exactly in thousandths (3 decimal places). */
const THOUSAND = 1000n;

/**
 * Verify a dispatch by scanning: every scan counts one unit of the product,
 * and each line shows matched, short or over against the dispatched
 * quantity; products that are not on the dispatch are listed as extra.
 * Nothing is saved — this is a loading-bay check.
 */
export function DispatchVerification({ lines }: { lines: VerifiableLine[] }) {
  /** Scanned SKU ids (or unknown codes, prefixed "?"), in scan order. */
  const [scans, setScans] = useState<{ key: string; label: string }[]>([]);
  const [status, setStatus] = useState<ScanStatus | null>(null);

  const counts = new Map<string, number>();
  for (const scan of scans) counts.set(scan.key, (counts.get(scan.key) ?? 0) + 1);

  const rows = lines.map((line) => {
    const scanned = BigInt(counts.get(line.skuId) ?? 0) * THOUSAND;
    const expected = parseScaled(line.expected, 3) ?? 0n;
    const outcome: Outcome = scanned === expected ? "matched" : scanned < expected ? "short" : "over";
    const difference = scanned > expected ? scanned - expected : expected - scanned;
    return { line, scanned: formatScaled(scanned, 3), difference: formatScaled(difference, 3), outcome };
  });
  const knownKeys = new Set(lines.map((l) => l.skuId));
  const extras = [...counts.entries()]
    .filter(([key]) => !knownKeys.has(key))
    .map(([key, count]) => ({ key, count, label: scans.find((s) => s.key === key)!.label }));

  const short = rows.filter((r) => r.outcome === "short").length;
  const over = rows.filter((r) => r.outcome === "over").length;
  const allMatched = scans.length > 0 && short === 0 && over === 0 && extras.length === 0;

  async function onScan(code: string) {
    const line = findByScanCode(lines, code);
    if (line) {
      setScans((current) => [...current, { key: line.skuId, label: line.code }]);
      setStatus({ tone: "success", text: `${line.code} · ${line.name}` });
      return;
    }
    try {
      const sku = await lookupSku(code);
      const label = sku ? `${sku.code} · ${sku.name}` : code;
      setScans((current) => [...current, { key: sku ? sku.id : `?${code}`, label }]);
      setStatus({ tone: "error", text: `${label} is not on this dispatch.` });
    } catch (error) {
      setStatus({ tone: "error", text: lookupErrorMessage(error) });
    }
  }

  return (
    <Card>
      <CardHeader
        title="Verify by scan"
        description="Scan each item being loaded; every scan counts one unit."
        actions={
          <>
            <Button variant="ghost" size="sm" disabled={scans.length === 0} onClick={() => setScans((s) => s.slice(0, -1))}>
              <Undo2 aria-hidden /> Undo last
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={scans.length === 0}
              onClick={() => {
                setScans([]);
                setStatus(null);
              }}
            >
              <RotateCcw aria-hidden /> Reset
            </Button>
          </>
        }
      />
      <div className="space-y-2 border-b border-slate-200 px-5 py-3">
        <ScanInput label="Scan item" onScan={onScan} status={status} className="max-w-xl" />
        <p
          role="status"
          className={cn(
            "text-sm font-medium",
            allMatched ? "text-emerald-700" : scans.length === 0 ? "text-slate-500" : "text-amber-700",
          )}
        >
          {scans.length === 0
            ? "Nothing scanned yet."
            : allMatched
              ? "Everything matches the dispatch."
              : `${short} short · ${over} over · ${extras.length} extra (${scans.length} scanned)`}
        </p>
      </div>
      <Table>
        <THead>
          <tr>
            <TH>Product</TH>
            <TH numeric>Dispatched</TH>
            <TH numeric>Scanned</TH>
            <TH>Result</TH>
          </tr>
        </THead>
        <TBody>
          {rows.map(({ line, scanned, difference, outcome }) => (
            <TR key={line.skuId} className={OUTCOME[outcome].row}>
              <TD>
                <span className="font-medium text-slate-900">{line.code}</span>
                <span className="block text-xs text-slate-500">{line.name}</span>
              </TD>
              <TD numeric>
                {formatQuantity(line.expected)} <span className="text-xs text-slate-500">{line.unit}</span>
              </TD>
              <TD numeric>{formatQuantity(scanned)}</TD>
              <TD>
                <Badge tone={OUTCOME[outcome].tone}>
                  {OUTCOME[outcome].label}
                  {outcome !== "matched" && ` ${formatQuantity(difference)}`}
                </Badge>
              </TD>
            </TR>
          ))}
          {extras.map((extra) => (
            <TR key={extra.key} className={OUTCOME.extra.row}>
              <TD className="font-medium text-slate-900">{extra.label}</TD>
              <TD numeric>—</TD>
              <TD numeric>{extra.count}</TD>
              <TD>
                <Badge tone="danger">Extra — not on this dispatch</Badge>
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </Card>
  );
}
