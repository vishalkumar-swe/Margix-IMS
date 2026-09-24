import { movementReportQuerySchema } from "@/lib/validation/reports";
import { csvResponse } from "@/server/http/csv";
import { apiRoute } from "@/server/http/api-route";
import { movementReportCsv } from "@/server/modules/reports/reports.export";
import { getMovementReport } from "@/server/modules/reports/reports.queries";

export const GET = apiRoute({ permission: "report.view", query: movementReportQuerySchema }, async ({ query }) => {
  const report = await getMovementReport(query);
  if (query.format === "csv") {
    return csvResponse(`movements_${report.range.from}_${report.range.to}.csv`, movementReportCsv(report.entries));
  }
  return report;
});
