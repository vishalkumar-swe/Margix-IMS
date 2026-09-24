import { tallyJobsQuerySchema } from "@/lib/validation/tally";
import { apiRoute } from "@/server/http/api-route";
import { countTallyJobsByStatus, listTallyJobs } from "@/server/modules/tally/tally.queries";

export const GET = apiRoute({ permission: "tally.view", query: tallyJobsQuerySchema }, async ({ query }) => ({
  ...(await listTallyJobs(query)),
  counts: await countTallyJobsByStatus(),
}));
