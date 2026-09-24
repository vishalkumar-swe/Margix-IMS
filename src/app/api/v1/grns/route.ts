import { grnListQuerySchema } from "@/lib/validation/purchasing";
import { apiRoute } from "@/server/http/api-route";
import { listGrns } from "@/server/modules/purchasing/purchasing.queries";

export const GET = apiRoute({ permission: "grn.view", query: grnListQuerySchema }, ({ query }) => listGrns(query));
