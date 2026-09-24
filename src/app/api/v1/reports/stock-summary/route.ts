import { stockSummaryQuerySchema } from "@/lib/validation/reports";
import { csvResponse } from "@/server/http/csv";
import { apiRoute } from "@/server/http/api-route";
import { stockSummaryCsv } from "@/server/modules/reports/reports.export";
import { getStockSummary } from "@/server/modules/reports/reports.queries";

export const GET = apiRoute({ permission: "report.view", query: stockSummaryQuerySchema }, async ({ query }) => {
  const report = await getStockSummary(query);
  if (query.format === "csv") {
    return csvResponse(
      `stock-summary_${report.range.from}_${report.range.to}.csv`,
      stockSummaryCsv(report.rows, query.groupBy === "batch"),
    );
  }
  return report;
});
