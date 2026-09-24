import { apiRoute } from "@/server/http/api-route";
import { getDashboardSummary } from "@/server/modules/dashboard/dashboard.queries";

export const GET = apiRoute({ permission: "dashboard.view" }, () => getDashboardSummary());
