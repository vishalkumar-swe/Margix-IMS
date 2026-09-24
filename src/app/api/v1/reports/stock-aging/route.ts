import { todayIst } from "@/lib/dates";
import { stockAgingQuerySchema } from "@/lib/validation/reports";
import { csvResponse } from "@/server/http/csv";
import { apiRoute } from "@/server/http/api-route";
import { stockAgingCsv } from "@/server/modules/reports/reports.export";
import { getStockAging } from "@/server/modules/reports/reports.queries";

export const GET = apiRoute({ permission: "report.view", query: stockAgingQuerySchema }, async ({ query }) => {
  const report = await getStockAging(query);
  if (query.format === "csv") {
    return csvResponse(`${query.kind}-stock_${todayIst()}.csv`, stockAgingCsv(report.rows));
  }
  return report;
});
