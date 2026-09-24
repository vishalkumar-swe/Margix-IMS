import { auditQuerySchema } from "@/lib/validation/audit";
import { apiRoute } from "@/server/http/api-route";
import { listAuditLogs } from "@/server/modules/audit/audit.queries";

export const GET = apiRoute({ permission: "audit.view", query: auditQuerySchema }, ({ query }) => listAuditLogs(query));
