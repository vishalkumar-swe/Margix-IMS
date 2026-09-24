"use client";

import { ChartColumn, Table2 } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { InfoHint } from "./info-hint";

/**
 * A chart with a "view as table" toggle (accessible fallback with the exact
 * figures) and an optional CSV download for the section.
 */
export function ChartPanel({
  title,
  description,
  hint,
  csvHref,
  chart,
  table,
  empty,
  className,
}: {
  title: string;
  description?: string;
  hint?: string;
  csvHref?: string;
  chart: ReactNode;
  table: ReactNode;
  /** Shown instead of chart and table when there is nothing to plot. */
  empty?: ReactNode;
  className?: string;
}) {
  const [asTable, setAsTable] = useState(false);
  return (
    <Card className={className}>
      <CardHeader
        title={
          <span className="inline-flex items-center gap-1.5">
            {title}
            {hint && <InfoHint text={hint} />}
          </span>
        }
        description={description}
        actions={
          empty ? undefined : (
            <>
              <Button variant="ghost" size="sm" onClick={() => setAsTable((v) => !v)} aria-pressed={asTable}>
                {asTable ? <ChartColumn aria-hidden /> : <Table2 aria-hidden />}
                {asTable ? "View chart" : "View table"}
              </Button>
              {csvHref && (
                <a href={csvHref} download className="text-sm font-medium text-brand-700 hover:underline">
                  CSV
                </a>
              )}
            </>
          )
        }
      />
      {empty ?? (asTable ? table : <div className="px-3 py-4">{chart}</div>)}
    </Card>
  );
}
