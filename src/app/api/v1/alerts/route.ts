import { alertListQuerySchema } from "@/lib/validation/alerts";
import { apiRoute } from "@/server/http/api-route";
import { listStockAlerts } from "@/server/modules/alerts/alerts.queries";

export const GET = apiRoute({ permission: "alert.view", query: alertListQuerySchema }, ({ query }) =>
  listStockAlerts(query),
);
