import type { Metadata } from "next";
import { StockAgingReport } from "@/features/reports/stock-aging-report";
import { can } from "@/lib/permissions";
import { parseSearchParams } from "@/lib/search-params";
import { stockAgingQuerySchema } from "@/lib/validation/reports";
import { requirePagePermission } from "@/server/auth/current-user";
import { listGodowns } from "@/server/modules/masters/masters.queries";
import { getStockAging } from "@/server/modules/reports/reports.queries";

export const metadata: Metadata = { title: "Dead stock" };

export default async function DeadStockPage({ searchParams }: PageProps<"/reports/dead-stock">) {
  const user = await requirePagePermission("report.view");
  const query = parseSearchParams(stockAgingQuerySchema, { ...(await searchParams), kind: "dead" });
  const [{ minDays, rows }, godowns] = await Promise.all([getStockAging(query), listGodowns()]);
  return (
    <StockAgingReport
      kind="dead"
      minDays={minDays}
      rows={rows}
      godownId={query.godownId}
      godowns={godowns}
      canReorder={can(user.role, "po.manage")}
      canConfigure={can(user.role, "settings.manage")}
    />
  );
}
