import { apiRoute, uuidParam } from "@/server/http/api-route";
import { retryTallyJob } from "@/server/modules/tally/tally-sync.service";

export const POST = apiRoute({ permission: "tally.sync" }, ({ actor, params }) =>
  retryTallyJob(actor, uuidParam(params, "id", "Tally sync job")),
);
