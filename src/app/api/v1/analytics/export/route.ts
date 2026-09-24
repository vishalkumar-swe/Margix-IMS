import { resolvePeriod } from "@/lib/analytics";
import { todayIst } from "@/lib/dates";
import { analyticsExportQuerySchema } from "@/lib/validation/analytics";
import { csvResponse } from "@/server/http/csv";
import { apiRoute } from "@/server/http/api-route";
import { analyticsCsv } from "@/server/modules/analytics/analytics.export";

/** One analytics section as a CSV download, with the same filters as the page. */
export const GET = apiRoute({ permission: "report.view", query: analyticsExportQuerySchema }, async ({ query }) => {
  const { period } = resolvePeriod(query, todayIst());
  const { section, categoryId, skuId, customerId, supplierId } = query;
  const csv = await analyticsCsv(section, { period, categoryId, skuId, customerId, supplierId });
  return csvResponse(`analytics-${section}_${period.from}_${period.to}.csv`, csv);
});
